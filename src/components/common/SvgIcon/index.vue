<template>
  <svg :class="svgClass" aria-hidden="true">
    <use :xlink:href="iconName" />
  </svg>
</template>

<script>
// SVG 雪碧图图标组件：<svg-icon icon-class="name" /> 引用 src/assets/icons/svg/{name}.svg
export default {
  name: 'SvgIcon',
  props: {
    // svg 文件名（不含扩展名）
    iconClass: {
      type: String,
      required: true
    },
    // 附加 class（如尺寸控制）
    className: {
      type: String,
      default: ''
    }
  },
  computed: {
    iconName() {
      return `#icon-${this.iconClass}`
    },
    svgClass() {
      const cls = this.className ? `svg-icon ${this.className}` : 'svg-icon'
      // loading 图标自动旋转（沿用 el-icon-loading 字体图标行为）
      return this.iconClass === 'loading' ? `${cls} is-loading` : cls
    }
  }
}
</script>

<style scoped>
.svg-icon {
  width: 1em;
  height: 1em;
  vertical-align: -0.15em;
  fill: currentColor;
  overflow: hidden;
}

.svg-icon.is-loading {
  animation: svg-icon-cw 1.6s linear infinite;
}

@keyframes svg-icon-cw {
  to {
    transform: rotate(360deg);
  }
}
</style>
