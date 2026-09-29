<template>
  <!-- 本轮回答的文件变更汇总面板：位于正文末尾与 meta 操作行之间
       触发行「N 个文件已更改 +A -D」常驻（随对话记录持久化呈现，数据源为已落盘的 fileChange），
       点击后列表向上展开（同文件仅显示最新一次变更）；点击列表项弹窗查看单文件详情：
       左侧为该文件的变更历史（树形 tab，逐次点击切换），右侧为选中变更的 GitHub 风格左右比对 -->
  <div class="ob-fcp">
    <!-- 变更列表（置于触发行上方，展开时向上生长） -->
    <transition name="ob-fcp">
      <div v-if="expanded" class="ob-fcp-list">
        <div v-for="(g, i) in fileGroups" :key="g.file" class="ob-fcp-item" @click="openDetail(i)">
          <svg-icon
            :icon-class="g.latest.type === 'mkdir' ? 'folder' : 'document'"
            class="ob-fcp-item-ico"
            :class="g.latest.type"
          />
          <span class="ob-fcp-item-file" :title="g.file">{{ g.file }}</span>
          <span
            v-if="g.history.length > 1"
            class="ob-fcp-item-times"
            :title="'该文件本轮共变更 ' + g.history.length + ' 次'"
          >{{ g.history.length }} 次</span>
          <span class="ob-fcp-item-type" :class="g.latest.type">{{ typeLabel(g.latest.type) }}</span>
          <span v-if="addedOf(g.latest) !== null" class="ob-fcp-add">+{{ addedOf(g.latest) }}</span>
          <span v-if="removedOf(g.latest) !== null" class="ob-fcp-del">-{{ removedOf(g.latest) }}</span>
          <svg-icon icon-class="arrow-right" class="ob-fcp-item-arrow" />
        </div>
      </div>
    </transition>

    <!-- 触发行：汇总计数 + 增删行数（按去重后各文件最新一次变更统计），点击展开/收起 -->
    <div class="ob-fcp-trigger" @click="expanded = !expanded">
      <svg-icon icon-class="edit" class="ob-fcp-trigger-ico" />
      <span class="ob-fcp-trigger-text">{{ fileGroups.length }} 个文件已更改</span>
      <span v-if="totalAdded !== null" class="ob-fcp-add">+{{ totalAdded }}</span>
      <span v-if="totalRemoved !== null" class="ob-fcp-del">-{{ totalRemoved }}</span>
      <svg-icon icon-class="arrow-down" class="ob-fcp-trigger-arrow" :class="{ open: expanded }" />
    </div>

    <!-- 单文件变更详情弹窗：左=变更历史树形 tab，右=选中变更的双列 diff
         v-if 按需挂载，避免长会话中大量历史弹窗常驻 DOM；
         diff 内容宽高需求大 → 宽幅居中弹窗；append-to-body 挂到 body 下，
         脱离消息滚动区的 mask 层叠上下文（否则 fixed 被裁剪且无法置顶） -->
    <el-dialog
      v-if="groupIndex !== null"
      :visible.sync="dialogVisible"
      custom-class="ob-fcd-dialog"
      width="min(1180px, 92vw)"
      append-to-body
      @closed="groupIndex = null; changeIndex = -1"
    >
      <div v-if="group" class="ob-fcd-wrap">
        <header class="ob-fcd-head">
          <span v-if="detail" class="ob-fcd-type" :class="detail.type">{{ typeLabel(detail.type) }}</span>
          <span class="ob-fcd-file" :title="group.file">{{ group.file }}</span>
          <span v-if="detail && addedOf(detail) !== null" class="ob-fcp-add">+{{ addedOf(detail) }}</span>
          <span v-if="detail && removedOf(detail) !== null" class="ob-fcp-del">-{{ removedOf(detail) }}</span>
          <svg-icon icon-class="close" class="ob-dialog-close" @click="dialogVisible = false" />
        </header>

        <div class="ob-fcd-body">
          <!-- 左侧：变更历史（按时间正序，默认选中最新一次；固定高度内部滚动） -->
          <div class="ob-fcd-history">
            <div class="ob-fcd-history-title">变更历史</div>
            <div class="ob-fcd-history-list">
              <div
                v-for="(c, hi) in group.history"
                :key="hi"
                class="ob-fcd-history-item"
                :class="{ active: hi === changeIndex }"
                @click="changeIndex = hi"
              >
                <span class="ob-fcd-history-name">第{{ hi + 1 }}次</span>
                <span class="ob-fcd-history-type" :class="c.type">{{ typeLabel(c.type) }}</span>
                <span v-if="addedOf(c) !== null" class="ob-fcp-add">+{{ addedOf(c) }}</span>
                <span v-if="removedOf(c) !== null" class="ob-fcp-del">-{{ removedOf(c) }}</span>
              </div>
            </div>
          </div>

          <!-- 右侧：选中变更的 GitHub 风格双列 diff（左旧右新，hunk 收敛；代码行不折行，超宽横向滚动） -->
          <div class="ob-fcd-main" v-if="detail">
            <div v-if="detail.rows && detail.rows.length" class="ob-fcd-table">
              <div v-for="(row, ri) in detail.rows" :key="ri" class="ob-fcd-row" :class="row.type">
                <template v-if="row.type === 'header'">
                  <span class="ob-fcd-hdr">{{ row.text }}</span>
                </template>
                <template v-else>
                  <span class="ob-fcd-ln">{{ row.left ? row.left.n : '' }}</span>
                  <span class="ob-fcd-cell old">{{ cellText(row.left) }}</span>
                  <span class="ob-fcd-ln">{{ row.right ? row.right.n : '' }}</span>
                  <span class="ob-fcd-cell new">{{ cellText(row.right) }}</span>
                </template>
              </div>
            </div>
            <!-- 无逐行内容的场景：超限 / 删除 / 新建目录 -->
            <div v-else-if="detail.truncated" class="ob-fcd-empty">
              文件较大（超过 512KB），仅记录了变更类型与行数，未做逐行对比
            </div>
            <div v-else-if="detail.type === 'deleted'" class="ob-fcd-empty">该文件已被删除</div>
            <div v-else-if="detail.type === 'mkdir'" class="ob-fcd-empty">已创建目录</div>
            <div v-else class="ob-fcd-empty">无逐行对比内容</div>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script>
// 文件变更汇总面板（消息级）：聚合本轮 tool items 的 fileChange，
// 同一文件去重（列表仅呈现最新一次变更，完整历史在详情弹窗左侧以树形 tab 呈现）。
// 数据来自 message.items（实时 tool_end 写入 / 历史记录归一化恢复），天然随会话持久化。
export default {
  name: 'FileChangesPanel',
  props: {
    // fileChange 数组（按工具调用时序）：{ file, type:'created'|'modified'|'deleted'|'mkdir', added, removed, rows, truncated }
    changes: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      expanded: false,
      groupIndex: null, // 当前查看的文件分组下标（null = 未挂载弹窗）
      changeIndex: -1, // 选中查看的变更在 history 中的下标
      dialogVisible: false
    }
  },
  computed: {
    // 按文件去重分组：{ file, history: [fileChange...], latest }（保持首次出现顺序）
    fileGroups() {
      const map = new Map()
      this.changes.forEach(c => {
        if (!c || !c.file) return
        if (!map.has(c.file)) map.set(c.file, { file: c.file, history: [] })
        map.get(c.file).history.push(c)
      })
      const groups = Array.from(map.values())
      groups.forEach(g => { g.latest = g.history[g.history.length - 1] })
      return groups
    },
    group() {
      return this.groupIndex === null ? null : (this.fileGroups[this.groupIndex] || null)
    },
    // 当前查看的变更（由左侧变更历史 tab 选中项决定）
    detail() {
      return this.group ? (this.group.history[this.changeIndex] || null) : null
    },
    // 汇总新增行数（按去重后各文件最新一次变更统计；部分超限未知时不计入，全部未知则不显示）
    totalAdded() {
      return this.sumKnown(this.fileGroups.map(g => g.latest.added))
    },
    totalRemoved() {
      return this.sumKnown(this.fileGroups.map(g => g.latest.removed))
    }
  },
  methods: {
    typeLabel(t) {
      return { created: '新建', modified: '修改', deleted: '删除', mkdir: '新建目录' }[t] || '变更'
    },
    // 行数取值（-1 = 超限未知 → 不显示）
    addedOf(c) {
      return typeof c.added === 'number' && c.added >= 0 ? c.added : null
    },
    removedOf(c) {
      return typeof c.removed === 'number' && c.removed >= 0 ? c.removed : null
    },
    // 已知值求和（无任何已知值返回 null）
    sumKnown(vals) {
      const known = vals.filter(v => typeof v === 'number' && v >= 0)
      if (!known.length) return null
      return known.reduce((a, b) => a + b, 0)
    },
    // 空行占位：pre-wrap 下空字符串无行框会塌陷，用单个空格撑起行高
    cellText(side) {
      return side ? (side.text || ' ') : ''
    },
    // 打开单文件详情：默认选中最新一次变更
    openDetail(i) {
      const g = this.fileGroups[i]
      if (!g) return
      this.groupIndex = i
      this.changeIndex = g.history.length - 1
      this.dialogVisible = true
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

.ob-fcp {
  display: flex;
  flex-direction: column;
  align-items: stretch; /* 触发行与列表同宽 */
  width: 100%;
  margin: 6px 0 2px;
  user-select: none;
}

/* ===== 触发行：N 个文件已更改 +A -D（与列表等宽，绿色虚线框突出变更区域） ===== */
.ob-fcp-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 12px 5px 15px;
  border: 1px dashed rgba(16, 185, 129, 0.5);
  border-radius: 7px;
  background: rgba(16, 185, 129, 0.05);
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;

  &:hover {
    background: rgba(16, 185, 129, 0.1);
    border-color: rgba(16, 185, 129, 0.8);
    color: var(--text-primary);
  }

  .ob-fcp-trigger-ico {
    font-size: 12px;
    color: #10B981;
  }

  .ob-fcp-trigger-text {
    white-space: nowrap;
  }

  .ob-fcp-trigger-arrow {
    margin-left: auto; /* 右对齐 */
    font-size: 10px;
    transition: transform 0.2s ease;

    &.open {
      transform: rotate(180deg);
    }
  }
}

.ob-fcp-add,
.ob-fcp-del {
  flex-shrink: 0; /* flex 容器（触发行/弹窗头部）防压缩；grid 中自动忽略 */
  justify-self: center;
  font-size: 11.5px;
  font-weight: 600;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}

.ob-fcp-add { color: #10B981; }
.ob-fcp-del { color: #EF4444; }

/* ===== 文件列表（向上展开，同文件仅显示最新一次变更） ===== */
.ob-fcp-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  max-height: 264px;
  overflow-y: auto;
  margin-bottom: 4px;
  padding: 6px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-secondary, rgba(0, 0, 0, 0.02));
}

/* 列表行：grid 固定列宽 + 显式列定位，图标/文件名自适应，
   次数/类型/增删统计各列纵向对齐（某列缺失时占位空列，后续列不错位） */
.ob-fcp-item {
  display: grid;
  /* 图标 | 文件名(弹性) | 次数 | 类型 | +新增 | -删除 | 箭头：定宽列保证跨行严格对齐 */
  grid-template-columns: auto minmax(0, 1fr) 44px 56px 40px 40px auto;
  align-items: center;
  column-gap: 8px;
  min-width: 0;
  padding: 5px 8px;
  border-radius: 7px;
  cursor: pointer;
  transition: background 0.12s ease;

  /* 显式列定位：次数/增删列 v-if 缺失时不塌陷，后续列保持原位 */
  .ob-fcp-item-ico { grid-column: 1; }
  .ob-fcp-item-file { grid-column: 2; }
  .ob-fcp-item-times { grid-column: 3; }
  .ob-fcp-item-type { grid-column: 4; }
  .ob-fcp-add { grid-column: 5; }
  .ob-fcp-del { grid-column: 6; }
  .ob-fcp-item-arrow { grid-column: 7; }

  &:hover {
    background: var(--search-bg-hover, rgba(0, 0, 0, 0.05));

    .ob-fcp-item-arrow {
      color: var(--text-primary);
      opacity: 1;
    }
  }

  .ob-fcp-item-ico {
    flex-shrink: 0;
    font-size: 13px;
    color: var(--text-secondary);

    &.created { color: #10B981; }
    &.modified { color: #0284C7; }
    &.deleted { color: #EF4444; }
    &.mkdir { color: #10B981; }
  }

  .ob-fcp-item-file {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 12px;
    color: var(--text-primary);
    font-family: 'SF Mono', Menlo, Consolas, monospace;
  }

  /* 同文件多次变更提示（定宽列内居中） */
  .ob-fcp-item-times {
    justify-self: center;
    font-size: 10px;
    padding: 1px 4px;
    border-radius: 4px;
    color: var(--text-secondary);
    border: 1px solid var(--border-color);
    white-space: nowrap;
  }

  .ob-fcp-item-arrow {
    flex-shrink: 0;
    font-size: 10px;
    color: var(--text-secondary);
    opacity: 0.55;
    transition: all 0.12s ease;
  }
}

.ob-fcp-item-type {
  justify-self: center;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 4px;
  white-space: nowrap;

  &.created,
  &.mkdir {
    color: #10B981;
    background: rgba(16, 185, 129, 0.12);
  }

  &.modified {
    color: #0284C7;
    background: rgba(2, 132, 199, 0.12);
  }

  &.deleted {
    color: #EF4444;
    background: rgba(239, 68, 68, 0.12);
  }
}

/* 列表展开过渡（淡入 + 自下轻微位移，呼应向上展开） */
.ob-fcp-enter-active,
.ob-fcp-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.ob-fcp-enter,
.ob-fcp-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

/* ===== 详情弹窗（el-dialog append-to-body，custom-class 定制样式需非 scoped 生效） ===== */
::v-deep .ob-fcd-dialog {
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.22);
  background: var(--bg-primary, #fff);

  .el-dialog__header,
  .el-dialog__footer {
    display: none; /* 头/底部由自绘 ob-fcd-head 承载 */
  }

  .el-dialog__body {
    padding: 0;
  }
}

/* 弹窗内容包裹层 */
.ob-fcd-wrap {
  display: flex;
  flex-direction: column;
  min-height: 420px;
  max-height: min(78vh, 860px);
}

/* 弹窗头部：类型徽章 + 文件路径 + 增删统计 + 关闭钮 */
.ob-fcd-head {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 14px 18px 12px;
  border-bottom: 1px solid var(--border-color);

  .ob-dialog-close {
    margin-left: auto;
  }
}

.ob-fcd-type {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;

  &.created,
  &.mkdir {
    color: #10B981;
    background: rgba(16, 185, 129, 0.12);
  }

  &.modified {
    color: #0284C7;
    background: rgba(2, 132, 199, 0.12);
  }

  &.deleted {
    color: #EF4444;
    background: rgba(239, 68, 68, 0.12);
  }
}

.ob-fcd-file {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}

/* ===== 弹窗主体：左=变更历史树形 tab，右=选中变更 diff
   两栏并列撑满弹窗剩余高度，各自独立滚动 ===== */
.ob-fcd-body {
  display: flex;
  gap: 16px;
  flex: 1;
  min-height: 0;
  padding: 14px 18px 18px;
}

.ob-fcd-history {
  flex-shrink: 0;
  width: 176px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 左栏小标题 */
.ob-fcd-history-title {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1px;
  color: var(--text-secondary);
  padding: 0 4px 8px;
}

.ob-fcd-history-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-secondary, rgba(0, 0, 0, 0.02));
}

/* 树形 tab 项：时间正序，左侧状态点 + 竖向引导线；grid 定宽列 + 显式列定位，
   类型/统计列缺失时占位空列，后续列保持原位不错位 */
.ob-fcd-history-item {
  position: relative;
  display: grid;
  /* 第N次 | 类型 | +新增 | -删除（定宽列纵向严格对齐） */
  grid-template-columns: minmax(0, 1fr) 44px 32px 32px;
  align-items: center;
  column-gap: 4px;
  padding: 8px 8px 8px 18px;
  border-radius: 7px;
  cursor: pointer;
  transition: background 0.12s ease;

  /* 显式列定位 */
  .ob-fcd-history-name { grid-column: 1; }
  .ob-fcd-history-type { grid-column: 2; }
  .ob-fcp-add { grid-column: 3; }
  .ob-fcp-del { grid-column: 4; }

  /* 竖向引导线 */
  &::before {
    content: '';
    position: absolute;
    left: 6px;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--border-color);
  }

  /* 状态点 */
  &::after {
    content: '';
    position: absolute;
    left: 3px;
    top: 50%;
    transform: translateY(-50%);
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--border-color);
    border: 2px solid var(--bg-secondary, #fff);
  }

  &:first-child::before { top: 50%; }
  &:last-child::before { bottom: 50%; }

  &:hover {
    background: var(--search-bg-hover, rgba(0, 0, 0, 0.05));
  }

  &.active {
    background: rgba(2, 132, 199, 0.1);

    &::after {
      background: #0284C7;
    }
  }

  .ob-fcd-history-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
  }
}

.ob-fcd-history-type {
  justify-self: center;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  white-space: nowrap;

  &.created,
  &.mkdir {
    color: #10B981;
    background: rgba(16, 185, 129, 0.12);
  }

  &.modified {
    color: #0284C7;
    background: rgba(2, 132, 199, 0.12);
  }

  &.deleted {
    color: #EF4444;
    background: rgba(239, 68, 68, 0.12);
  }
}

/* 右侧 diff 区：撑满剩余宽度，全高内部滚动（内部卡片也拉伸与左侧历史卡片等高） */
.ob-fcd-main {
  flex: 1;
  min-width: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

/* ===== 双列 diff（GitHub split 风格：行号 + 旧文 | 行号 + 新文） ===== */
/* 整表单一 grid：行 display: contents 摊平，列宽由全表最宽单元格统一决定
   （若每行独立 grid，max-content 各行自算会导致行间错位）；
   代码行不折行（white-space: pre），超宽在 .ob-fcd-main 横向滚动 */
.ob-fcd-table {
  flex: 1;
  align-self: flex-start;
  display: grid;
  grid-template-columns: 44px max-content 44px max-content;
  width: max-content;
  min-width: 100%;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.75;
}

/* 行摊平进父级 grid（DOM 结构不变，行类型 class 仍可作用到单元格） */
.ob-fcd-row {
  display: contents;

  /* 删除行：左半红调；新增行：右半绿调；上下文行无底色 */
  &.del .ob-fcd-cell.old {
    background: rgba(239, 68, 68, 0.1);
    color: #B91C1C;
  }

  &.add .ob-fcd-cell.new {
    background: rgba(16, 185, 129, 0.1);
    color: #047857;
  }

  /* hunk 头横幅（GitHub 蓝调）：整行摊平后，横幅跨满全部 4 列 */
  &.header .ob-fcd-hdr {
    grid-column: 1 / -1;
    padding: 4px 12px;
    background: rgba(9, 105, 218, 0.08);
    color: #0550AE;
    font-size: 11px;
    user-select: none;
  }
}

.ob-fcd-ln {
  padding: 0 6px;
  text-align: right;
  color: var(--text-secondary);
  opacity: 0.65;
  user-select: none;
  white-space: nowrap;
}

.ob-fcd-cell {
  padding: 1px 12px;
  white-space: pre;
  color: var(--text-primary);

  /* 左右分栏中线 */
  &.old {
    border-right: 1px solid var(--border-color);
  }
}

/* 无逐行内容说明（超限 / 删除 / 新建目录）：同样撑满与左侧等高 */
.ob-fcd-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px 14px;
  border: 1px solid rgba(230, 162, 60, 0.35);
  border-radius: 10px;
  background: rgba(230, 162, 60, 0.08);
  font-size: 12.5px;
  text-align: center;
  color: #a06a1b;
}
</style>
