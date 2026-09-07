<template>
  <svg :class="svgClass" aria-hidden="true" v-on="$listeners">
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
      return this.className ? `svg-icon ${this.className}` : 'svg-icon'
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
</style>
