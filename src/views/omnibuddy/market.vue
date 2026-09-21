<template>
  <!-- 资源市场页（空状态占位：后续接入 Skill / 智能体等资源分发） -->
  <div class="ob-blank-page">
    <div class="ob-blank-box">
      <div class="ob-blank-icon">
        <svg-icon icon-class="gift" />
      </div>
      <p class="ob-blank-title">资源市场</p>
      <p class="ob-blank-desc">发现并安装 Skill、智能体与模板，扩展 Buddy 的能力</p>
      <p class="ob-blank-sub">敬请期待</p>
    </div>
  </div>
</template>

<script>
// OmniBuddy 资源市场页：空状态占位
export default {
  name: 'OmniBuddyMarket'
}
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-blank.scss';
</style>
