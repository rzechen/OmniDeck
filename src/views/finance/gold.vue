<template>
  <tool-shell
    title="黄金"
    desc="实时金价行情与走势"
    icon="gold"
    color="#FAAD14"
  >
    <div class="gold-page">
      <div class="gold-placeholder">
        <div class="gold-badge">TODO</div>
        <div class="gold-icon">
          <svg-icon icon-class="gold" class="gold-svg" />
        </div>
        <div class="gold-title">功能规划中，敬请期待</div>
        <div class="gold-desc">黄金模块将与基金模块共用理财体系，规划包含以下能力</div>
        <div class="gold-features">
          <div class="gold-feature">
            <i class="el-icon-coin"></i>
            <span>实时金价</span>
          </div>
          <div class="gold-feature">
            <i class="el-icon-data-line"></i>
            <span>行情走势</span>
          </div>
          <div class="gold-feature">
            <i class="el-icon-scale-to-original"></i>
            <span>克/盎司换算</span>
          </div>
          <div class="gold-feature">
            <i class="el-icon-pie-chart"></i>
            <span>持仓估值</span>
          </div>
        </div>
        <div class="gold-hint">
          <i class="el-icon-info"></i>
          可先使用「基金」模块管理持仓
          <router-link class="gold-link" to="/finance/fund">前往 ›</router-link>
        </div>
      </div>
    </div>

    <template #status>
      <span class="status-dot"></span>
      <span>理财 · 规划中</span>
      <span class="status-right">更多理财工具持续加入</span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'

export default {
  name: 'FinanceGold',
  components: { ToolShell }
}
</script>

<style lang="scss" scoped>
.gold-page {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-app-region: no-drag;
}

.gold-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 36px 48px;
  position: relative;
}

/* TODO 角标 */
.gold-badge {
  position: absolute;
  top: 0;
  right: -10px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1px;
  color: #D46B08;
  background: rgba(250, 173, 20, 0.15);
  border: 1px solid rgba(250, 173, 20, 0.4);
  padding: 3px 10px;
  border-radius: 999px;
  transform: rotate(12deg);
}

.gold-icon {
  width: 72px;
  height: 72px;
  border-radius: 22px;
  background: linear-gradient(135deg, rgba(250, 173, 20, 0.16), rgba(250, 173, 20, 0.05));
  border: 1px solid rgba(250, 173, 20, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;

  .gold-svg {
    width: 36px;
    height: 36px;
    color: #FAAD14;
  }
}

.gold-title {
  margin-top: 4px;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.gold-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

/* 规划能力标签 */
.gold-features {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 8px;
  max-width: 380px;
}

.gold-feature {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--text-secondary);
  background: var(--search-bg);
  border: 1px solid var(--border-color);
  border-radius: 999px;
  padding: 5px 12px;

  i {
    font-size: 13px;
    color: #FAAD14;
  }
}

/* 引导提示 */
.gold-hint {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 10px;
  font-size: 11.5px;
  color: var(--text-secondary);

  i {
    font-size: 13px;
  }
}

.gold-link {
  color: var(--primary-color);
  text-decoration: none;
  font-weight: 600;

  &:hover {
    opacity: 0.8;
  }
}
</style>
