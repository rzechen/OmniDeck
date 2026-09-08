<template>
  <tool-shell
    title="国旗 Emoji"
    desc="各国 Unicode 国旗 Emoji 一键复制"
    icon="flag"
    color="#13C2C2"
    back-path="/tools/life"
  >
    <div class="flag-page">
      <!-- 顶部搜索框：Mac 胶囊风格 -->
      <div class="flag-search">
        <i class="el-icon-search"></i>
        <input v-model="keyword" placeholder="搜索国家…" />
        <span v-if="keyword" class="flag-count">{{ filtered.length }} / {{ countries.length }}</span>
        <i
          v-if="keyword"
          class="el-icon-circle-close flag-clear"
          title="清空"
          @click="keyword = ''"
        ></i>
      </div>

      <!-- 国家卡片网格：点击复制国旗 Emoji -->
      <div class="flag-grid" :class="{ 'is-empty': !filtered.length }">
        <div
          v-for="(c, i) in filtered"
          :key="i"
          class="flag-card"
          :title="'点击复制：' + c.name"
          @click="copyFlag(c)"
        >
          <span class="flag-emoji">{{ c.flag }}</span>
          <span class="flag-name">{{ c.name }}</span>
        </div>
        <!-- 空结果提示 -->
        <div v-if="!filtered.length" class="flag-empty">无匹配结果</div>
      </div>
    </div>

    <template #status>
      <span class="status-dot"></span>
      <span>{{ countries.length }} 面国旗</span>
      <span class="status-right">点击卡片复制 Emoji</span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'

export default {
  name: 'LifeFlag',
  components: { ToolShell },
  data() {
    return {
      // 搜索关键词
      keyword: '',
      // 国旗 Emoji 数据，提取自旧项目 nationalFlag 模块
      countries: [
        { flag: '🇦🇨', name: '阿森松岛' },
        { flag: '🇨🇳', name: '中国' },
        { flag: '🇺🇸', name: '美国' },
        { flag: '🇯🇵', name: '日本' },
        { flag: '🇦🇩', name: '安道尔' },
        { flag: '🇦🇪', name: '阿联酋' },
        { flag: '🇦🇫', name: '阿富汗' },
        { flag: '🇦🇬', name: '安提瓜和巴布达' },
        { flag: '🇦🇮', name: '安圭拉' },
        { flag: '🇦🇱', name: '阿尔巴尼亚' },
        { flag: '🇦🇲', name: '亚美尼亚' },
        { flag: '🇦🇴', name: '安哥拉' },
        { flag: '🇦🇶', name: '南极洲' },
        { flag: '🇦🇷', name: '阿根廷' },
        { flag: '🇦🇸', name: '美属萨摩亚群岛' },
        { flag: '🇦🇹', name: '奥地利' },
        { flag: '🇦🇺', name: '澳大利亚' },
        { flag: '🇦🇼', name: '阿鲁巴' },
        { flag: '🇦🇽', name: '奥兰群岛' },
        { flag: '🇦🇿', name: '阿塞拜疆' },
        { flag: '🇧🇦', name: '波黑' },
        { flag: '🇧🇧', name: '巴多斯' },
        { flag: '🇧🇩', name: '孟加拉国' },
        { flag: '🇧🇪', name: '比利时' },
        { flag: '🇧🇫', name: '布基纳法索' },
        { flag: '🇧🇬', name: '保加利亚' },
        { flag: '🇧🇭', name: '巴林' },
        { flag: '🇧🇮', name: '布隆迪' },
        { flag: '🇧🇯', name: '贝宁' },
        { flag: '🇧🇱', name: '圣巴泰勒米' },
        { flag: '🇧🇲', name: '百慕大' },
        { flag: '🇧🇳', name: '文莱' },
        { flag: '🇧🇴', name: '玻利维亚' },
        { flag: '🇧🇶', name: '荷兰加勒比' },
        { flag: '🇧🇷', name: '巴西' },
        { flag: '🇧🇸', name: '巴哈马' },
        { flag: '🇧🇹', name: '不丹' },
        { flag: '🇧🇻', name: '布维岛' },
        { flag: '🇧🇼', name: '博茨瓦纳' },
        { flag: '🇧🇾', name: '白俄罗斯' },
        { flag: '🇧🇿', name: '伯利兹' },
        { flag: '🇨🇦', name: '加拿大' },
        { flag: '🇨🇨', name: '科科斯群岛' },
        { flag: '🇨🇩', name: '刚果(金)' },
        { flag: '🇨🇫', name: '中非共和国' },
        { flag: '🇨🇬', name: '刚果(布)' },
        { flag: '🇨🇭', name: '瑞士' },
        { flag: '🇨🇮', name: '科特迪瓦' },
        { flag: '🇨🇰', name: '库克群岛' },
        { flag: '🇨🇱', name: '智利' },
        { flag: '🇨🇲', name: '喀麦隆' },
        { flag: '🇨🇴', name: '哥伦比亚' },
        { flag: '🇨🇵', name: '克利珀顿岛' },
        { flag: '🇨🇷', name: '哥斯达黎加' },
        { flag: '🇨🇺', name: '古巴' },
        { flag: '🇨🇻', name: '佛得角' },
        { flag: '🇨🇼', name: '库拉索' },
        { flag: '🇨🇽', name: '圣诞岛' },
        { flag: '🇨🇾', name: '塞浦路斯' },
        { flag: '🇨🇿', name: '捷克共和国' },
        { flag: '🇩🇪', name: '德国' },
        { flag: '🇩🇬', name: '迪戈加西亚' },
        { flag: '🇩🇯', name: '吉布提' },
        { flag: '🇩🇰', name: '丹麦' },
        { flag: '🇩🇲', name: '多米尼加' },
        { flag: '🇩🇴', name: '多明尼加共和国' },
        { flag: '🇩🇿', name: '阿尔及利亚' },
        { flag: '🇪🇦', name: '休达和梅利利亚' },
        { flag: '🇪🇨', name: '厄瓜多尔' },
        { flag: '🇪🇪', name: '爱沙尼亚' },
        { flag: '🇪🇬', name: '埃及' },
        { flag: '🇪🇭', name: '西撒哈拉' },
        { flag: '🇪🇷', name: '厄立特里亚' },
        { flag: '🇪🇸', name: '西班牙' },
        { flag: '🇪🇹', name: '埃塞俄比亚' },
        { flag: '🇪🇺', name: '欧盟' },
        { flag: '🇫🇮', name: '芬兰' },
        { flag: '🇫🇯', name: '斐济' },
        { flag: '🇫🇰', name: '福克兰群岛' },
        { flag: '🇫🇲', name: '密克罗尼西亚' },
        { flag: '🇫🇴', name: '法罗群岛' },
        { flag: '🇫🇷', name: '法国' },
        { flag: '🇬🇦', name: '加蓬' },
        { flag: '🇬🇧', name: '英国' },
        { flag: '🇬🇩', name: '格林纳达' },
        { flag: '🇬🇪', name: '格鲁吉亚' },
        { flag: '🇬🇫', name: '法属圭亚那' },
        { flag: '🇬🇬', name: '根西岛' },
        { flag: '🇬🇭', name: '加纳' },
        { flag: '🇬🇮', name: '直布罗陀' },
        { flag: '🇬🇱', name: '格陵兰' },
        { flag: '🇬🇲', name: '冈比亚' },
        { flag: '🇬🇳', name: '几内亚' },
        { flag: '🇬🇵', name: '瓜德罗普岛' },
        { flag: '🇬🇶', name: '赤道几内亚' },
        { flag: '🇬🇷', name: '希腊' },
        { flag: '🇬🇸', name: '南乔治亚岛和南桑威奇群岛' },
        { flag: '🇬🇹', name: '危地马拉' },
        { flag: '🇬🇺', name: '关岛' },
        { flag: '🇬🇼', name: '几内亚比绍' },
        { flag: '🇬🇾', name: '圭亚那' },
        { flag: '🇭🇰', name: '香港区旗' },
        { flag: '🇭🇲', name: '赫德与麦克唐纳群岛' },
        { flag: '🇭🇳', name: '洪都拉斯' },
        { flag: '🇭🇷', name: '克罗地亚' },
        { flag: '🇭🇹', name: '海地' },
        { flag: '🇭🇺', name: '匈牙利' },
        { flag: '🇮🇨', name: '加那利群岛' },
        { flag: '🇮🇩', name: '印尼' },
        { flag: '🇮🇪', name: '爱尔兰' },
        { flag: '🇮🇱', name: '以色列' },
        { flag: '🇮🇲', name: '曼岛' },
        { flag: '🇮🇳', name: '印度' },
        { flag: '🇮🇴', name: '英属印度洋领地' },
        { flag: '🇮🇶', name: '伊拉克' },
        { flag: '🇮🇷', name: '伊朗' },
        { flag: '🇮🇸', name: '冰岛' },
        { flag: '🇮🇹', name: '意大利' },
        { flag: '🇯🇪', name: '泽西' },
        { flag: '🇯🇲', name: '牙买加' },
        { flag: '🇯🇴', name: '约旦' },
        { flag: '🇰🇪', name: '肯尼亚' },
        { flag: '🇰🇬', name: '吉尔吉斯斯坦' },
        { flag: '🇰🇭', name: '柬埔寨' },
        { flag: '🇰🇮', name: '基里巴斯' },
        { flag: '🇰🇲', name: '科摩罗' },
        { flag: '🇰🇳', name: '圣基茨和尼维斯' },
        { flag: '🇰🇵', name: '朝鲜' },
        { flag: '🇰🇷', name: '韩国' },
        { flag: '🇰🇼', name: '科威特' },
        { flag: '🇰🇾', name: '开曼群岛' },
        { flag: '🇰🇿', name: '哈萨克斯坦' },
        { flag: '🇱🇦', name: '老挝' },
        { flag: '🇱🇧', name: '黎巴嫩' },
        { flag: '🇱🇨', name: '圣卢西亚' },
        { flag: '🇱🇮', name: '列支敦士登' },
        { flag: '🇱🇰', name: '斯里兰卡' },
        { flag: '🇱🇷', name: '利比里亚' },
        { flag: '🇱🇸', name: '莱索托' },
        { flag: '🇱🇹', name: '立陶宛' },
        { flag: '🇱🇺', name: '卢森堡' },
        { flag: '🇱🇻', name: '拉脱维亚' },
        { flag: '🇱🇾', name: '利比亚' },
        { flag: '🇲🇦', name: '摩洛哥' },
        { flag: '🇲🇨', name: '摩纳哥' },
        { flag: '🇲🇩', name: '摩尔多瓦' },
        { flag: '🇲🇪', name: '黑山' },
        { flag: '🇲🇫', name: '圣马丁' },
        { flag: '🇲🇬', name: '马达加斯加' },
        { flag: '🇲🇭', name: '马绍尔群岛' },
        { flag: '🇲🇰', name: '马其顿' },
        { flag: '🇲🇱', name: '马里' },
        { flag: '🇲🇲', name: '缅甸' },
        { flag: '🇲🇳', name: '蒙古' },
        { flag: '🇲🇴', name: '澳门区旗' },
        { flag: '🇲🇵', name: '北马里亚纳群岛' },
        { flag: '🇲🇶', name: '马提尼克岛' },
        { flag: '🇲🇷', name: '毛里塔尼亚' },
        { flag: '🇲🇸', name: '蒙特塞拉特' },
        { flag: '🇲🇹', name: '马耳他' },
        { flag: '🇲🇺', name: '毛里求斯' },
        { flag: '🇲🇻', name: '马尔代夫' },
        { flag: '🇲🇼', name: '马拉维' },
        { flag: '🇲🇽', name: '墨西哥' },
        { flag: '🇲🇾', name: '马来西亚' },
        { flag: '🇲🇿', name: '莫桑比克' },
        { flag: '🇳🇦', name: '纳米比亚' },
        { flag: '🇳🇨', name: '新喀里多尼亚' },
        { flag: '🇳🇪', name: '尼日尔' },
        { flag: '🇳🇫', name: '诺福克岛' },
        { flag: '🇳🇬', name: '尼日利亚' },
        { flag: '🇳🇮', name: '尼加拉瓜' },
        { flag: '🇳🇱', name: '荷兰' },
        { flag: '🇳🇴', name: '挪威' },
        { flag: '🇳🇵', name: '尼泊尔' },
        { flag: '🇳🇷', name: '瑙鲁' },
        { flag: '🇳🇺', name: '纽埃' },
        { flag: '🇳🇿', name: '新西兰' },
        { flag: '🇴🇲', name: '阿曼' },
        { flag: '🇵🇦', name: '巴拿马' },
        { flag: '🇵🇪', name: '秘鲁' },
        { flag: '🇵🇫', name: '法属波利尼西亚' },
        { flag: '🇵🇬', name: '巴布亚新几内亚' },
        { flag: '🇵🇭', name: '菲律宾' },
        { flag: '🇵🇰', name: '巴基斯坦' },
        { flag: '🇵🇱', name: '波兰' },
        { flag: '🇵🇲', name: '圣皮埃尔和密克隆群岛' },
        { flag: '🇵🇳', name: '皮特凯恩群岛' },
        { flag: '🇵🇷', name: '波多黎各' },
        { flag: '🇵🇸', name: '巴勒斯坦领土' },
        { flag: '🇵🇹', name: '葡萄牙' },
        { flag: '🇵🇼', name: '帕劳' },
        { flag: '🇵🇾', name: '巴拉圭' },
        { flag: '🇶🇦', name: '卡塔尔' },
        { flag: '🇷🇪', name: '团圆' },
        { flag: '🇷🇴', name: '罗马尼亚' },
        { flag: '🇷🇸', name: '塞尔维亚' },
        { flag: '🇷🇺', name: '俄罗斯' },
        { flag: '🇷🇼', name: '卢旺达' },
        { flag: '🇸🇦', name: '沙特阿拉伯' },
        { flag: '🇸🇧', name: '所罗门群岛' },
        { flag: '🇸🇨', name: '塞舌尔' },
        { flag: '🇸🇩', name: '苏丹' },
        { flag: '🇸🇪', name: '瑞典' },
        { flag: '🇸🇬', name: '新加坡' },
        { flag: '🇸🇭', name: '圣赫勒拿' },
        { flag: '🇸🇮', name: '斯洛文尼亚' },
        { flag: '🇸🇯', name: '斯瓦尔巴群岛和扬马延' },
        { flag: '🇸🇰', name: '斯洛伐克' },
        { flag: '🇸🇱', name: '塞拉利昂' },
        { flag: '🇸🇲', name: '圣马力诺' },
        { flag: '🇸🇳', name: '塞内加尔' },
        { flag: '🇸🇴', name: '索马里' },
        { flag: '🇸🇷', name: '苏里南' },
        { flag: '🇸🇸', name: '南苏丹' },
        { flag: '🇸🇹', name: '圣多美和普林西比' },
        { flag: '🇸🇻', name: '萨尔瓦多' },
        { flag: '🇸🇽', name: '圣马丁岛' },
        { flag: '🇸🇾', name: '叙利亚' },
        { flag: '🇸🇿', name: '斯威士兰' },
        { flag: '🇹🇦', name: '特里斯坦 - 达库尼亚群岛' },
        { flag: '🇹🇨', name: '特克斯和凯科斯群岛' },
        { flag: '🇹🇩', name: '乍得' },
        { flag: '🇹🇫', name: '法国南方的领土' },
        { flag: '🇹🇬', name: '多哥' },
        { flag: '🇹🇭', name: '泰国' },
        { flag: '🇹🇯', name: '塔吉克斯坦' },
        { flag: '🇹🇰', name: '托克劳' },
        { flag: '🇹🇱', name: '东帝汶' },
        { flag: '🇹🇲', name: '土库曼斯坦' },
        { flag: '🇹🇳', name: '突尼斯' },
        { flag: '🇹🇴', name: '汤加' },
        { flag: '🇹🇷', name: '土耳其' },
        { flag: '🇹🇹', name: '特立尼达和多巴哥' },
        { flag: '🇹🇻', name: '图瓦卢' },
        { flag: '🇹🇿', name: '坦桑尼亚' },
        { flag: '🇺🇦', name: '乌克兰' },
        { flag: '🇺🇬', name: '乌干达' },
        { flag: '🇺🇲', name: '美国离岛' },
        { flag: '🇺🇾', name: '乌拉圭' },
        { flag: '🇺🇿', name: '乌兹别克斯坦' },
        { flag: '🇻🇦', name: '梵蒂冈城' },
        { flag: '🇻🇨', name: '圣文森特和格林纳丁斯' },
        { flag: '🇻🇪', name: '委内瑞拉' },
        { flag: '🇻🇬', name: '英属维尔京群岛' },
        { flag: '🇻🇮', name: '美属维尔京群岛' },
        { flag: '🇻🇳', name: '越南' },
        { flag: '🇻🇺', name: '瓦努阿图' },
        { flag: '🇼🇫', name: '瓦利斯和富图纳群岛' },
        { flag: '🇼🇸', name: '萨摩亚' },
        { flag: '🇽🇰', name: '科索沃' },
        { flag: '🇾🇪', name: '也门' },
        { flag: '🇾🇹', name: '马约特' },
        { flag: '🇿🇦', name: '南非' },
        { flag: '🇿🇲', name: '赞比亚' },
        { flag: '🇿🇼', name: '津巴布韦' },
      ]
    }
  },
  computed: {
    // 按国家名关键词过滤
    filtered() {
      const k = this.keyword.trim().toLowerCase()
      if (!k) return this.countries
      return this.countries.filter(c => c.name.toLowerCase().includes(k))
    }
  },
  methods: {
    // 复制国旗 Emoji 到剪贴板并提示
    copyFlag(c) {
      navigator.clipboard.writeText(c.flag).then(() => {
        this.$message({ message: `已复制：${c.flag} ${c.name}`, type: 'success', duration: 1200 })
      })
    }
  }
}
</script>

<style lang="scss" scoped>
.flag-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 搜索框：Mac 胶囊风格 */
.flag-search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 14px;
  background: var(--search-bg);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  flex-shrink: 0;
  transition: all 0.16s ease;

  &:focus-within {
    border-color: rgba(var(--primary-color-rgb), 0.5);
    box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.1);
    background: var(--card-bg);
  }

  i {
    color: var(--text-secondary);
    font-size: 14px;
  }

  input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-size: 13px;
    color: var(--text-primary);

    &::placeholder {
      color: var(--text-secondary);
    }
  }

  .flag-count {
    font-size: 11px;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .flag-clear {
    font-size: 13px;
    color: var(--text-secondary);
    cursor: pointer;
    flex-shrink: 0;
    border-radius: 50%;
    transition: all 0.15s ease;

    &:hover {
      color: var(--text-primary);
      transform: scale(1.1);
    }
  }
}

/* 国家卡片网格 */
.flag-grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
  align-content: start;
  -webkit-app-region: no-drag;

  /* 空状态：网格区域整体垂直居中 */
  &.is-empty {
    align-content: center;
  }
}

/* 单个国旗卡片：hover 上浮 + 主题色描边 */
.flag-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 14px 8px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  user-select: none;
  transition: all 0.16s ease;

  &:hover {
    transform: translateY(-2px);
    border-color: rgba(var(--primary-color-rgb), 0.5);
    box-shadow: var(--shadow-sm);
  }

  &:active {
    transform: translateY(-1px) scale(0.97);
  }
}

.flag-emoji {
  font-size: 28px;
  line-height: 1;
}

.flag-name {
  font-size: 12px;
  color: var(--text-primary);
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 空结果提示 */
.flag-empty {
  grid-column: 1 / -1;
  text-align: center;
  color: var(--text-secondary);
  font-size: 12px;
}
</style>
