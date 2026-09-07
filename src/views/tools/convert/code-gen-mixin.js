// JSON → 代码（Java/Go/JS/TS）四页共享逻辑：
// 输入防抖、类名校验、generate() 钩子、复制/下载/清空
import { downloadText } from '@/utils/download'

export const jsonToCodeMixin = {
  data() {
    return {
      jsonInput: '',
      className: 'MyClass',
      packageName: '',
      output: '',
      errorMsg: '',
      classCount: 0,
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
      })
    },
    downloadOutput() {
      if (!this.output) {
        this.$message.warning('没有可下载的内容')
        return
      }
      const name = (this.className.trim() || 'MyClass') + '.' + this.ext
      downloadText(name, this.output)
    },
    clearAll() {
      this.jsonInput = ''
      this.output = ''
      this.$refs.inputEditor.focus()
    }
  }
}
