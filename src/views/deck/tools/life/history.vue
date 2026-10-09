<template>
  <tool-shell
    title="历史朝代"
    desc="中国历代王朝起止时间与都城速查"
    icon="history"
    color="#13C2C2"
    back-path="/tools/life"
  >
    <doc-list :rows="rows" :columns="columns" />
    <template #status>
      <span class="status-dot"></span>
      <span>{{ rows.length }} 条记录</span>
      <span class="status-right">支持搜索</span>
    </template>
  </tool-shell>
</template>

<script setup>
import { ref } from 'vue'
import ToolShell from '@/components/tool/ToolShell.vue'
import DocList from '@/components/tool/DocList.vue'

defineOptions({ name: 'LifeHistory' })

const columns = ref([
  { key: 'dynasty', title: '朝代', tag: true },
  { key: 'period', title: '起止时间' },
  { key: 'capital', title: '都城' },
  { key: 'location', title: '今地' },
  { key: 'desc', title: '简介' }
])
const rows = ref([
  { dynasty: '中华人民共和国', period: '1949/10/1 - 至今', capital: '北京', location: '北京', desc: '现代中国，社会主义制度，科技与经济快速发展' },
  { dynasty: '中华民国', period: '1912-1949', capital: '南京', location: '江苏南京', desc: '推翻清朝建立的资产阶级共和国，近代化探索' },
  { dynasty: '清', period: '1616-1911', capital: '北京', location: '北京', desc: '满族建立，康乾盛世后期腐败，列强入侵' },
  { dynasty: '明', period: '1368-1644', capital: '北京', location: '北京', desc: '推翻元朝恢复汉族政权，科技与海外贸易发展' },
  { dynasty: '元', period: '1206-1368', capital: '大都', location: '北京', desc: '蒙古族建立，首次全国统一少数民族王朝' },
  { dynasty: '金', period: '1115-1234', capital: '会宁/中都/开封', location: '黑龙江阿城/北京/河南开封', desc: '女真族建立，北方政权，与南宋对峙' },
  { dynasty: '西夏', period: '1038-1227', capital: '兴庆府', location: '宁夏银川', desc: '党项族建立，阻碍宋向西发展' },
  { dynasty: '辽', period: '907-1125', capital: '皇都(上京)', location: '内蒙古巴林左旗', desc: '契丹族政权，开创契丹文字，军事强盛' },
  { dynasty: '南宋', period: '1127-1279', capital: '临安', location: '浙江杭州', desc: '偏安江南，经济文化繁荣，抗金抗元' },
  { dynasty: '北宋', period: '960-1127', capital: '开封', location: '河南开封', desc: '重文轻武，科技与经济繁荣，后被金灭' },
  { dynasty: '五代十国', period: '907-979', capital: '多变', location: '中国中原与南方', desc: '政权频繁更迭，局势动荡' },
  { dynasty: '唐', period: '618-907', capital: '长安', location: '陕西西安', desc: '中国历史盛世之一，对外交流频繁' },
  { dynasty: '隋', period: '581-618', capital: '大兴', location: '陕西西安', desc: '大运河开通，统一南北，国祚短' },
  { dynasty: '南北朝', period: '420-589', capital: '建康/平城等', location: '江苏/山西等', desc: '南北分治，民族融合加速' },
  { dynasty: '十六国', period: '304-439', capital: '—', location: '—', desc: '五胡乱华时期，地方割据' },
  { dynasty: '三国', period: '220-280', capital: '洛阳/成都/建业', location: '河南/四川/江苏', desc: '魏蜀吴三国鼎立，英雄辈出' },
  { dynasty: '东汉', period: '25—220', capital: '洛阳', location: '河南洛阳', desc: '光武中兴，后期宦官外戚之争' },
  { dynasty: '西汉', period: '前206—25', capital: '长安', location: '陕西西安', desc: '汉武盛世，丝绸之路开通' },
  { dynasty: '秦', period: '前221-207年', capital: '咸阳', location: '陕西咸阳', desc: '首次统一中国，书同文车同轨，暴政速亡' },
  { dynasty: '东周', period: '前770-256年', capital: '洛邑', location: '河南洛阳', desc: '春秋战国并列，诸子百家活跃' },
  { dynasty: '西周', period: '约前1029-771年', capital: '镐京', location: '陕西西安', desc: '封建制度起源，礼乐文明发达' },
  { dynasty: '商', period: '约前1675-1029年', capital: '亳', location: '河南商丘', desc: '青铜文明，甲骨文出现' },
  { dynasty: '夏', period: '约前2146-1675年', capital: '安邑', location: '山西夏县', desc: '中国第一个王朝，史书记载较多争议' },
])
</script>
