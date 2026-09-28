<template>
  <!-- 工作空间规则弹窗（B 方案收编）：复用 RuleEditor 编辑当前空间的 AGENTS.md
       弹窗骨架与「导入 Skill」弹窗同款（ob-overlay / ob-dialog / ob-dialog-header） -->
  <transition name="ob-modal">
    <div v-if="visible" class="ob-overlay" @mousedown.self="$emit('close')">
      <div class="ob-dialog sr-dialog">
        <header class="ob-dialog-header">
          <div class="sr-head-left">
            <h3 class="ob-dialog-title">{{ spaceName }} · 空间规则</h3>
            <span v-if="hasRule" class="sr-badge ok">已配置</span>
            <span v-else class="sr-badge none">未配置</span>
          </div>
          <svg-icon icon-class="close" class="ob-dialog-close" @click="$emit('close')" />
        </header>

        <div class="sr-body">
          <rule-editor
            v-if="loaded"
            :target-key="spaceId"
            :initial-content="content"
            :placeholder="placeholder"
            @saved="$emit('saved')"
          />
          <div v-else class="sr-loading"><buddy-skeleton type="rows" :count="4" /></div>
        </div>

        <footer class="sr-foot">规则仅在此工作空间的对话中生效；保存后新对话生效，清空并保存即删除</footer>
      </div>
    </div>
  </transition>
</template>

<script>
// 空间规则弹窗：getRule 读取 → RuleEditor 编辑保存（保存即销毁 pi 会话，主进程内置）
import RuleEditor from '@/components/buddy/RuleEditor.vue'
import BuddySkeleton from '@/components/buddy/BuddySkeleton.vue'

export default {
  name: 'SpaceRuleDialog',
  components: { RuleEditor, BuddySkeleton },
  props: {
    visible: {
      type: Boolean,
      default: false
    },
    // 工作空间 id（规则目标 key）
    spaceId: {
      type: String,
      default: ''
    },
    spaceName: {
      type: String,
      default: ''
    },
    // 外部传入的规则状态（hasRule，用于头部徽标）
    hasRule: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      loaded: false,
      content: ''
    }
  },
  computed: {
    placeholder() {
      return [
        '# 本空间说明',
        '此目录存放财务月度报表与凭证扫描件',
        '',
        '# 约定',
        '- 日期格式统一 YYYYMMDD',
        '- 供应商名录在 vendors.xlsx，以最新版为准'
      ].join('\n')
    }
  },
  watch: {
    // 打开时读取当前空间规则内容（切空间后重开走同一入口）
    async visible(v) {
      if (!v) return
      this.loaded = false
      const api = window.electronAPI && window.electronAPI.omnibuddy
      if (!api || !api.getRule || !this.spaceId) {
        this.content = ''
        this.loaded = true
        return
      }
      try {
        const res = await api.getRule(this.spaceId)
        this.content = (res && res.ok && res.content) || ''
      } catch (e) {
        this.content = ''
      }
      this.loaded = true
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

/* 弹窗骨架（遮罩/圆角/头部/关闭按钮）来自 buddy-settings 的 ob-overlay / ob-dialog 体系，
   此处仅补充规则编辑场景的尺寸与局部样式 */
.sr-dialog {
  width: min(920px, calc(100vw - 48px));
  aspect-ratio: auto;
  height: min(640px, calc(100vh - 48px));
}

.sr-head-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;

  .ob-dialog-title {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.sr-badge {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 5px;
  line-height: 1.6;

  &.ok {
    color: #52C41A;
    background: rgba(82, 196, 26, 0.1);
    border: 1px solid rgba(82, 196, 26, 0.3);
  }

  &.none {
    color: $text-secondary;
    background: $search-bg;
    border: 1px solid var(--border-color);
  }
}

.sr-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.sr-loading {
  width: 100%;
}

.sr-foot {
  flex-shrink: 0;
  padding: 10px 18px 14px;
  font-size: 11.5px;
  color: $text-secondary;
  border-top: 1px solid var(--border-color);
}
</style>
