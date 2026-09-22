<template>
  <div class="ob-grid-card" :class="{ disabled: !item.enabled }">
    <div class="ob-card-head">
      <div class="ob-card-logo logo-connector">
        <svg-icon icon-class="mcp" />
      </div>
      <div class="ob-card-title">
        <div class="ob-card-name" :title="item.name">
          <span class="ob-name-text">{{ item.name }}</span>
          <span class="ob-mcp-badge" :class="item.transport === 'http' ? 'is-http' : 'is-stdio'">
            {{ item.transport === 'http' ? 'HTTP' : 'stdio' }}
          </span>
        </div>
        <div class="ob-card-meta">{{ item.description || '（无描述）' }}</div>
      </div>
      <!-- 开关直改引用属性，切换后的当前值随 toggle 事件上抛，持久化与失败回滚由父级处理 -->
      <el-switch
        v-model="item.enabled"
        class="ob-card-switch"
        @change="$emit('toggle', item)"
      />
    </div>

    <div class="ob-card-cmdline" :title="item.transport === 'http' ? item.url : item.command + ' ' + (item.args || []).join(' ')">
      <template v-if="item.transport === 'http'">{{ item.url }}</template>
      <template v-else>{{ item.command }} {{ (item.args || []).join(' ') }}</template>
    </div>

    <div class="ob-card-foot">
      <div class="ob-foot-info">
        <span v-if="!item.enabled" class="ob-foot-off">已停用</span>
      </div>
      <div class="ob-card-actions">
        <span class="ob-item-action" title="编辑" @click="$emit('edit', item)">
          <svg-icon icon-class="edit" />
        </span>
        <span class="ob-item-action danger" title="删除" @click="$emit('remove', item)">
          <svg-icon icon-class="delete" />
        </span>
      </div>
    </div>
  </div>
</template>

<script>
// 连接器卡片：启用开关（toggle 上抛切换后的当前值）/ 编辑 / 删除，均交父级处理
export default {
  name: 'McpCard',
  props: {
    // 单个 MCP Server 配置（对象引用与父级列表共享，保存失败父级可直接回滚 enabled）
    item: {
      type: Object,
      required: true
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

/* 卡片命令行配置（灰底等宽） */
.ob-card-cmdline {
  margin-bottom: 12px;
  padding: 7px 10px;
  border-radius: $radius-base;
  background: $search-bg;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  color: $text-secondary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 头部开关（与徽标对齐） */
.ob-card-switch {
  flex-shrink: 0;
}

/* 已停用文字提示 */
.ob-foot-off {
  color: $text-secondary;
  background: $search-bg;
  padding: 1px 6px;
  border-radius: 4px;
}
</style>
