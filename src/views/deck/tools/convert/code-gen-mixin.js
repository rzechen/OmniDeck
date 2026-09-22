// JSON → 代码（Java/Go/JS/TS）四页共享逻辑：
// 输入防抖、类名校验、generate() 钩子、复制/下载/清空
import { downloadText } from '@/utils/download'
import { record, get as getHistory } from '@/utils/tool-history'

export const jsonToCodeMixin = {
  data() {
    return {
      jsonInput: '',
      className: 'MyClass',
      packageName: '',
      output: '',
      errorMsg: '',
      classCount: 0,
      historyVisible: false,
      // 子组件覆盖
      example: '',
      ext: 'txt'
    }
  },
  watch: {
    jsonInput() {
      clearTimeout(this._timer)
      this._timer = setTimeout(() => this.convert(), 250)
    },
    className() {
      this.convert()
    },
    packageName() {
      this.convert()
    }
  },
  mounted() {
    this.jsonInput = this.example
    this.convert()
  },
  beforeDestroy() {
    clearTimeout(this._timer)
  },
  methods: {
    // 子组件实现：返回生成代码字符串，抛错显示错误
    // generate(obj, className) {}
    convert() {
      this.errorMsg = ''
      this.output = ''
      if (!this.jsonInput.trim()) return
      const name = this.className.trim()
      if (!name) {
        this.errorMsg = '请输入类名'
        return
      }
      try {
        const obj = JSON.parse(this.jsonInput)
        if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
          throw new Error('请输入 JSON 对象（非数组）')
        }
        this.output = this.generate(obj, name)
      } catch (e) {
        this.errorMsg = e.message
      }
    },
    copyOutput() {
      if (!this.output) {
        this.$message.warning('没有可复制的内容')
        return
      }
      navigator.clipboard.writeText(this.output).then(() => {
        this.$message.success('复制成功')
        // 仅按钮触发记录（防抖自动转换不记录）
        this.recordHistory('copy')
      })
    },
    downloadOutput() {
      if (!this.output) {
        this.$message.warning('没有可下载的内容')
        return
      }
      const name = (this.className.trim() || 'MyClass') + '.' + this.ext
      downloadText(name, this.output)
      this.recordHistory('download')
    },
    // 记录执行历史（toolPath 由各子页面 provide 或自身属性提供）
    recordHistory(action) {
      const toolPath = this.historyToolPath || this.$options.toolPath
      if (!toolPath) return
      record(toolPath, {
        input: this.jsonInput,
        output: this.output,
        options: {
          action: action,
          className: this.className,
          packageName: this.packageName
        }
      })
    },
    // 从历史恢复：回填输入（含类名/包名）并触发转换
    async restoreFromHistory(item) {
      const full = await getHistory(item.id)
      if (!full) {
        this.$message.warning('该记录已被删除')
        return
      }
      if (full.options) {
        if (full.options.className) this.className = full.options.className
        if (full.options.packageName) this.packageName = full.options.packageName
      }
      this.jsonInput = full.input || ''
      this.$nextTick(() => {
        this.convert()
        this.$refs.inputEditor && this.$refs.inputEditor.focus()
      })
      this.$message.success('已从历史恢复')
    },
    clearAll() {
      this.jsonInput = ''
      this.output = ''
      this.$refs.inputEditor.focus()
    }
  }
}
