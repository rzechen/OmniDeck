<template>
  <tool-shell
    title="历代帝王"
    desc="中国历代帝王在位时间速查"
    icon="crown"
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

<script>
import ToolShell from '@/components/tool/ToolShell.vue'
import DocList from '@/components/tool/DocList.vue'

export default {
  name: 'LifeEmperor',
  components: { ToolShell, DocList },
  data() {
    return {
      columns: [
        { key: 'dynasty', title: '朝代', tag: true },
        { key: 'name', title: '帝号' },
        { key: 'reign', title: '在位时间' },
        { key: 'desc', title: '备注' }
      ],
      rows: [
        { dynasty: '夏', name: '启', reign: '前 2100 年 - 前 1600 年（夏朝时期）', desc: '夏朝开国君主，都城阳城' },
        { dynasty: '商', name: '汤', reign: '前 1600 年 - 前 1100 年（商朝时期）', desc: '商朝开国君主，都城亳→殷' },
        { dynasty: '西周', name: '武王（姬发）', reign: '前 1100 年 - 前 771 年（西周时期）', desc: '西周开国君主，都城镐' },
        { dynasty: '东周', name: '周平王（姬宜臼）', reign: '前 770 年 - 前 256 年（东周时期）', desc: '东周开国君主，都城洛邑' },
        { dynasty: '秦', name: '始皇（嬴政）', reign: '前 221 年 - 前 206 年', desc: '中国第一位皇帝，统一六国，都城咸阳' },
        { dynasty: '西汉', name: '高祖（刘邦）', reign: '前 202 年 - 8 年（西汉时期）', desc: '西汉开国皇帝，都城长安' },
        { dynasty: '新', name: '王莽', reign: '8 年 - 23 年', desc: '建立新朝，都城长安' },
        { dynasty: '东汉', name: '光武帝（刘秀）', reign: '25 年 - 220 年（东汉时期）', desc: '东汉开国皇帝，都城洛阳' },
        { dynasty: '三国·魏', name: '曹丕', reign: '220 年 - 265 年', desc: '魏开国皇帝，都城洛阳' },
        { dynasty: '三国·蜀', name: '刘备', reign: '221 年 - 263 年', desc: '蜀开国皇帝，都城成都' },
        { dynasty: '三国·吴', name: '孙权', reign: '229 年 - 280 年', desc: '吴开国皇帝，都城建业' },
        { dynasty: '西晋', name: '武帝（司马炎）', reign: '265 年 - 316 年', desc: '西晋开国皇帝，都城洛阳' },
        { dynasty: '东晋', name: '元帝（司马睿）', reign: '317 年 - 420 年', desc: '东晋开国皇帝，都城建康' },
        { dynasty: '南朝宋', name: '刘裕', reign: '420 年 - 479 年', desc: '南朝宋开国皇帝，都城建康' },
        { dynasty: '南朝齐', name: '萧道成', reign: '427 年 - 482 年', desc: '南朝齐开国皇帝，都城建康' },
        { dynasty: '南朝梁', name: '萧衍', reign: '464 年 - 549 年', desc: '南朝梁开国皇帝，都城建康' },
        { dynasty: '南朝陈', name: '陈霸先', reign: '557 年 - 589 年', desc: '南朝陈开国皇帝，都城建康' },
        { dynasty: '北魏', name: '拓跋圭', reign: '386 年 - 534 年', desc: '北魏开国皇帝，都城平城→洛阳' },
        { dynasty: '东魏', name: '元善见（高欢立）', reign: '534 年 - 550 年', desc: '东魏皇帝，都城邺' },
        { dynasty: '西魏', name: '元宝炬（宇文泰立）', reign: '535 年 - 557 年', desc: '西魏皇帝，都城长安' },
        { dynasty: '北齐', name: '高洋', reign: '550 年 - 577 年', desc: '北齐开国皇帝，都城邺' },
        { dynasty: '北周', name: '宇文觉', reign: '557 年 - 581 年', desc: '北周开国皇帝，都城长安' },
        { dynasty: '隋', name: '文帝（杨坚）', reign: '581 年 - 618 年', desc: '隋朝开国皇帝，统一全国，都城大兴' },
        { dynasty: '唐', name: '高祖（李渊）', reign: '618-627 年', desc: '唐朝开国皇帝' },
        { dynasty: '唐', name: '太宗（李世民）', reign: '627-650 年', desc: '贞观之治' },
        { dynasty: '唐', name: '高宗（李治）', reign: '650-684 年', desc: '' },
        { dynasty: '唐', name: '中宗（李显）', reign: '684-684 年', desc: '' },
        { dynasty: '唐', name: '睿宗（李旦）', reign: '684-684 年', desc: '' },
        { dynasty: '唐', name: '武则天', reign: '684-705 年', desc: '中国唯一正统女皇帝' },
        { dynasty: '唐', name: '中宗（李显）', reign: '705-710 年', desc: '' },
        { dynasty: '唐', name: '殤帝（李重茂）', reign: '710-710 年', desc: '' },
        { dynasty: '唐', name: '睿宗（李旦）', reign: '710-712 年', desc: '' },
        { dynasty: '唐', name: '玄宗（李隆基）', reign: '712-756 年', desc: '开元盛世' },
        { dynasty: '唐', name: '肃宗（李亨）', reign: '756-762 年', desc: '' },
        { dynasty: '唐', name: '代宗（李豫）', reign: '762-780 年', desc: '' },
        { dynasty: '唐', name: '德宗（李适）', reign: '780-805 年', desc: '' },
        { dynasty: '唐', name: '顺宗（李诵）', reign: '805-806 年', desc: '' },
        { dynasty: '唐', name: '宪宗（李纯）', reign: '806-821 年', desc: '' },
        { dynasty: '唐', name: '穆宗（李恒）', reign: '821-825 年', desc: '' },
        { dynasty: '唐', name: '敬宗（李湛）', reign: '825-836 年', desc: '' },
        { dynasty: '唐', name: '文宗（李昂）', reign: '836-841 年', desc: '' },
        { dynasty: '唐', name: '武宗（李炎）', reign: '841-847 年', desc: '' },
        { dynasty: '唐', name: '宣宗（李忱）', reign: '847-860 年', desc: '' },
        { dynasty: '唐', name: '懿宗（李凗）', reign: '860-874 年', desc: '' },
        { dynasty: '唐', name: '僖宗（李儇）', reign: '874-889 年', desc: '' },
        { dynasty: '唐', name: '昭宗（李晔）', reign: '889-904 年', desc: '' },
        { dynasty: '唐', name: '哀帝（李柷）', reign: '904-907 年', desc: '' },
        { dynasty: '北宋', name: '太祖（赵匡胤）', reign: '960-976 年', desc: '陈桥兵变，北宋开国皇帝，都城开封' },
        { dynasty: '北宋', name: '太宗（赵炅）', reign: '976-998 年', desc: '' },
        { dynasty: '北宋', name: '真宗（赵恒）', reign: '998-1023 年', desc: '' },
        { dynasty: '北宋', name: '仁宗（赵祯）', reign: '1023-1064 年', desc: '' },
        { dynasty: '北宋', name: '英宗（赵曙）', reign: '1064-1068 年', desc: '' },
        { dynasty: '北宋', name: '神宗（赵顼）', reign: '1068-1086 年', desc: '' },
        { dynasty: '北宋', name: '哲宗（赵煦）', reign: '1086-1101 年', desc: '' },
        { dynasty: '北宋', name: '徽宗（赵佶）', reign: '1101-1126 年', desc: '' },
        { dynasty: '北宋', name: '钦宗（赵桓）', reign: '1126-1127 年', desc: '' },
        { dynasty: '南宋', name: '高宗（赵构）', reign: '1127-1163 年', desc: '南宋开国皇帝，都城临安' },
        { dynasty: '南宋', name: '孝宗（赵昚）', reign: '1163-1190 年', desc: '' },
        { dynasty: '南宋', name: '光宗（赵惇）', reign: '1190-1200 年', desc: '' },
        { dynasty: '南宋', name: '宁宗（赵扩）', reign: '1200-1225 年', desc: '' },
        { dynasty: '南宋', name: '理宗（赵昀）', reign: '1225-1265 年', desc: '' },
        { dynasty: '南宋', name: '度宗（赵禥）', reign: '1265-1275 年', desc: '' },
        { dynasty: '南宋', name: '恭宗（赵显）', reign: '1275-1276 年', desc: '' },
        { dynasty: '南宋', name: '端宗（赵昰）', reign: '1276-1278 年', desc: '' },
        { dynasty: '南宋', name: '卫王（赵昺）', reign: '1278-1279 年', desc: '' },
        { dynasty: '辽', name: '耶律阿宝机', reign: '916 年 - 1125 年（辽时期）', desc: '辽开国皇帝，都城上京' },
        { dynasty: '西夏', name: '李元昊', reign: '1038 年 - 1227 年（西夏时期）', desc: '西夏开国皇帝，都城兴庆' },
        { dynasty: '金', name: '完颜阿骨打', reign: '1115 年 - 1234 年（金时期）', desc: '金开国皇帝，都城中都' },
        { dynasty: '元', name: '世祖（忽必烈）', reign: '1271 年 - 1368 年', desc: '元朝开国皇帝，都城大都' },
        { dynasty: '明', name: '太祖（朱元璋）', reign: '1368-1399 年', desc: '明朝开国皇帝，都城南京→北京' },
        { dynasty: '明', name: '惠帝（朱允炆）', reign: '1399-1403 年', desc: '' },
        { dynasty: '明', name: '成祖（朱棣）', reign: '1403-1425 年', desc: '靖难之役，迁都北京' },
        { dynasty: '明', name: '仁宗（朱高炽）', reign: '1425-1426 年', desc: '' },
        { dynasty: '明', name: '宣宗（朱瞻基）', reign: '1426-1436 年', desc: '' },
        { dynasty: '明', name: '英宗（朱祁镇）', reign: '1436-1450 年', desc: '' },
        { dynasty: '明', name: '代宗（朱祁钰）', reign: '1450-1457 年', desc: '' },
        { dynasty: '明', name: '英宗（朱祁镇）', reign: '1457-1465 年', desc: '' },
        { dynasty: '明', name: '宪宗（朱见深）', reign: '1465-1488 年', desc: '' },
        { dynasty: '明', name: '孝宗（朱祐樘）', reign: '1488-1506 年', desc: '' },
        { dynasty: '明', name: '武宗（朱厚照）', reign: '1506-1522 年', desc: '' },
        { dynasty: '明', name: '世宗（朱厚熜）', reign: '1522-1567 年', desc: '' },
        { dynasty: '明', name: '穆宗（朱载垕）', reign: '1567-1573 年', desc: '' },
        { dynasty: '明', name: '神宗（朱翊钧）', reign: '1573-1620 年', desc: '' },
        { dynasty: '明', name: '光宗（朱常洛）', reign: '1620-1621 年', desc: '' },
        { dynasty: '明', name: '熹宗（朱由校）', reign: '1621-1628 年', desc: '' },
        { dynasty: '明', name: '毅宗（朱由检）', reign: '1628-1644 年', desc: '明朝末代皇帝' },
        { dynasty: '清', name: '世祖 - 顺治（福临）', reign: '1644-1662 年', desc: '' },
        { dynasty: '清', name: '圣祖 - 康熙（玄烨）', reign: '1662-1723 年', desc: '康乾盛世开创者' },
        { dynasty: '清', name: '世宗 - 雍正（胤禛）', reign: '1723-1736 年', desc: '' },
        { dynasty: '清', name: '高宗 - 乾隆（弘历）', reign: '1736-1796 年', desc: '康乾盛世' },
        { dynasty: '清', name: '仁宗 - 嘉庆（顺琰）', reign: '1796-1821 年', desc: '' },
        { dynasty: '清', name: '宣宗 - 道光（旻宁）', reign: '1821-1851 年', desc: '鸦片战争时期' },
        { dynasty: '清', name: '文宗 - 咸丰（奕詝）', reign: '1851-1862 年', desc: '' },
        { dynasty: '清', name: '穆宗 - 同治（载淳）', reign: '1862-1875 年', desc: '' },
        { dynasty: '清', name: '德宗 - 光绪（载湉）', reign: '1875-1908 年', desc: '戊戌变法时期' },
        { dynasty: '清', name: '恭宗 - 宣统（溥仪）', reign: '1908-1911 年', desc: '中国末代皇帝' },
      ]
    }
  }
}
</script>
