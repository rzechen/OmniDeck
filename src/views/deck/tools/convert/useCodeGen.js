// JSON → 代码（Java/Go/JS/TS）四页共享逻辑：
// 输入防抖、类名校验、generate() 钩子、复制/下载/清空
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { downloadText } from '@/utils/ui/download'
import { record, get as getHistory } from '@/utils/storage/tool-history'
import { useFeedback } from '@/composables/useFeedback'

// options：
// - toolPath：执行历史记录路径（各子页面传入自身路径）
// - example：初始示例输入（子组件覆盖）
// - ext：下载文件扩展名（子组件覆盖）
// - generate(obj, className)：子组件实现，返回生成代码字符串，抛错显示错误
export function useCodeGen({ toolPath = '', example = '', ext = 'txt', generate }) {
  const { message } = useFeedback()

  const jsonInput = ref('')
  const className = ref('MyClass')
  const packageName = ref('')
  const output = ref('')
  const errorMsg = ref('')
  const classCount = ref(0)
  const historyVisible = ref(false)
  // 输入编辑器（模板 ref="inputEditor" 绑定）
  const inputEditor = ref(null)

  // 防抖定时器（非响应式）
  let timer = null

  function convert() {
    errorMsg.value = ''
    output.value = ''
    if (!jsonInput.value.trim()) return
    const name = className.value.trim()
    if (!name) {
      errorMsg.value = '请输入类名'
      return
    }
    try {
      const obj = JSON.parse(jsonInput.value)
      if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
        throw new Error('请输入 JSON 对象（非数组）')
      }
      output.value = generate(obj, name)
    } catch (e) {
      errorMsg.value = e.message
    }
  }

  function copyOutput() {
    if (!output.value) {
      message.warning('没有可复制的内容')
      return
    }
    navigator.clipboard.writeText(output.value).then(() => {
      message.success('复制成功')
      // 仅按钮触发记录（防抖自动转换不记录）
      recordHistory('copy')
    })
  }

  function downloadOutput() {
    if (!output.value) {
      message.warning('没有可下载的内容')
      return
    }
    const name = (className.value.trim() || 'MyClass') + '.' + ext
    downloadText(name, output.value)
    recordHistory('download')
  }

  // 记录执行历史（toolPath 由各子页面传入）
  function recordHistory(action) {
    if (!toolPath) return
    record(toolPath, {
      input: jsonInput.value,
      output: output.value,
      options: {
        action: action,
        className: className.value,
        packageName: packageName.value
      }
    })
  }

  // 从历史恢复：回填输入（含类名/包名）并触发转换
  async function restoreFromHistory(item) {
    const full = await getHistory(item.id)
    if (!full) {
      message.warning('该记录已被删除')
      return
    }
    if (full.options) {
      if (full.options.className) className.value = full.options.className
      if (full.options.packageName) packageName.value = full.options.packageName
    }
    jsonInput.value = full.input || ''
    await nextTick()
    convert()
    inputEditor.value && inputEditor.value.focus()
    message.success('已从历史恢复')
  }

  function clearAll() {
    jsonInput.value = ''
    output.value = ''
    inputEditor.value.focus()
  }

  watch(jsonInput, () => {
    clearTimeout(timer)
    timer = setTimeout(() => convert(), 250)
  })
  watch(className, () => convert())
  watch(packageName, () => convert())

  onMounted(() => {
    jsonInput.value = example
    convert()
  })

  onBeforeUnmount(() => {
    clearTimeout(timer)
  })

  return {
    jsonInput,
    className,
    packageName,
    output,
    errorMsg,
    classCount,
    historyVisible,
    inputEditor,
    convert,
    copyOutput,
    downloadOutput,
    recordHistory,
    restoreFromHistory,
    clearAll
  }
}
