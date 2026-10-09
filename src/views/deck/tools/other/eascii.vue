<template>
  <tool-shell title="扩展 ASCII 码" desc="Latin-1 特殊字符的编码与 HTML 实体" icon="character" color="#FAAD14" back-path="/tools/other">
    <doc-list :rows="rows" :columns="columns" />
    <template #status>
      <span class="status-dot"></span>
      <span>{{ rows.length }} 条记录</span>
      <span class="status-right">支持搜索</span>
    </template>
  </tool-shell>
</template>

<script setup>
import ToolShell from '@/components/tool/ToolShell.vue'
import DocList from '@/components/tool/DocList.vue'

// 扩展 ASCII（Latin-1）速查：数据迁移自旧项目 eascii 模块
defineOptions({ name: 'OtherEascii' })

const columns = [
        { key: 'symbol', title: '符号', tag: true },
        { key: 'decimal', title: '十进制', mono: true },
        { key: 'hex', title: '十六进制', mono: true },
        { key: 'entity', title: 'HTML 实体', mono: true },
        { key: 'name', title: '名称' }
]

const rows = [
        { symbol: ' ', decimal: '0160', hex: '00A0', entity: '&nbsp;', name: '空格' },
        { symbol: '¡', decimal: '0161', hex: '00A1', entity: '&iexcl;', name: '倒感叹号' },
        { symbol: '¢', decimal: '0162', hex: '00A2', entity: '&cent;', name: '英分' },
        { symbol: '£', decimal: '0163', hex: '00A3', entity: '&pound;', name: '英镑' },
        { symbol: '¤', decimal: '0164', hex: '00A4', entity: '&curren;', name: '货币记号' },
        { symbol: '¥', decimal: '0165', hex: '00A5', entity: '&yen;', name: '日元' },
        { symbol: '§', decimal: '0167', hex: '00A7', entity: '&sect;', name: '小节符' },
        { symbol: '¨', decimal: '0168', hex: '00A8', entity: '&uml;', name: '分音符（元音变音）' },
        { symbol: '©', decimal: '0169', hex: '00A9', entity: '&copy;', name: '版权符' },
        { symbol: 'ª', decimal: '0170', hex: '00AA', entity: '&ordf;', name: '阴性序数记号' },
        { symbol: '«', decimal: '0171', hex: '00AB', entity: '&laquo;', name: '左指双尖引号' },
        { symbol: '¬', decimal: '0172', hex: '00AC', entity: '&not;', name: '非标记' },
        { symbol: '®', decimal: '0174', hex: '00AE', entity: '&reg;', name: '注册商标' },
        { symbol: '¯', decimal: '0175', hex: '00AF', entity: '&macr;', name: '长音符' },
        { symbol: '°', decimal: '0176', hex: '00B0', entity: '&deg;', name: '度' },
        { symbol: '±', decimal: '0177', hex: '00B1', entity: '&plusmn;', name: '正负' },
        { symbol: '´', decimal: '0180', hex: '00B4', entity: '&acute;', name: '重音符' },
        { symbol: 'µ', decimal: '0181', hex: '00B5', entity: '&micro;', name: '微符' },
        { symbol: '¶', decimal: '0182', hex: '00B6', entity: '&para;', name: '段落标记' },
        { symbol: '·', decimal: '0183', hex: '00B7', entity: '&middot;', name: '中心点 (Georgian comma)' },
        { symbol: '¸', decimal: '0184', hex: '00B8', entity: '&cedil;', name: '软音符' },
        { symbol: 'º', decimal: '0186', hex: '00BA', entity: '&ordm;', name: '阳性序数记号' },
        { symbol: '»', decimal: '0187', hex: '00BB', entity: '&raquo;', name: '右指双尖引号' },
        { symbol: '¿', decimal: '0191', hex: '00BF', entity: '&iquest;', name: '竖翻问号' },
        { symbol: 'À', decimal: '0192', hex: '00C0', entity: '&Agrave;', name: '抑音符 A' },
        { symbol: 'Á', decimal: '0193', hex: '00C1', entity: '&Aacute;', name: '锐音符 A' },
        { symbol: 'Â', decimal: '0194', hex: '00C2', entity: '&Acirc;', name: '扬抑符 A' },
        { symbol: 'Ã', decimal: '0195', hex: '00C3', entity: '&Atilde;', name: '颚化符 A' },
        { symbol: 'Ä', decimal: '0196', hex: '00C4', entity: '&Auml;', name: '分音符 A' },
        { symbol: 'Å', decimal: '0197', hex: '00C5', entity: '&Aring;', name: '带上圆圈的A' },
        { symbol: 'Æ', decimal: '0198', hex: '00C6', entity: '&AElig;', name: '连字AE' },
        { symbol: 'Ç', decimal: '0199', hex: '00C7', entity: '&Ccedil;', name: '下加符 C' },
        { symbol: 'È', decimal: '0200', hex: '00C8', entity: '&Egrave;', name: '抑音符 E' },
        { symbol: 'É', decimal: '0201', hex: '00C9', entity: '&Eacute;', name: '锐音符 E' },
        { symbol: 'Ê', decimal: '0202', hex: '00CA', entity: '&Ecirc;', name: '扬抑符 E' },
        { symbol: 'Ë', decimal: '0203', hex: '00CB', entity: '&Euml;', name: '分音符 E' },
        { symbol: 'Ì', decimal: '0204', hex: '00CC', entity: '&Igrave;', name: '抑音符 I' },
        { symbol: 'Í', decimal: '0205', hex: '00CD', entity: '&Iacute;', name: '锐音符 I' },
        { symbol: 'Î', decimal: '0206', hex: '00CE', entity: '&Icirc;', name: '扬抑符 I' },
        { symbol: 'Ï', decimal: '0207', hex: '00CF', entity: '&Iuml;', name: '分音符 I' },
        { symbol: 'Ñ', decimal: '0209', hex: '00D1', entity: '&Ntilde;', name: '颚化符 N' },
        { symbol: 'Ò', decimal: '0210', hex: '00D2', entity: '&Ograve;', name: '抑音符 O' },
        { symbol: 'Ó', decimal: '0211', hex: '00D3', entity: '&Oacute;', name: '锐音符 O' },
        { symbol: 'Ô', decimal: '0212', hex: '00D4', entity: '&Ocirc;', name: '扬抑符 O' },
        { symbol: 'Õ', decimal: '0213', hex: '00D5', entity: '&Otilde;', name: '颚化符 O' },
        { symbol: 'Ö', decimal: '0214', hex: '00D6', entity: '&Ouml;', name: '分音符 O' },
        { symbol: 'Ø', decimal: '0216', hex: '00D8', entity: '&Oslash;', name: '带斜线的 O' },
        { symbol: 'Ù', decimal: '0217', hex: '00D9', entity: '&Ugrave;', name: '抑音符 U' },
        { symbol: 'Ú', decimal: '0218', hex: '00DA', entity: '&Uacute;', name: '锐音符 U' },
        { symbol: 'Û', decimal: '0219', hex: '00DB', entity: '&Ucirc;', name: '扬抑符 U' },
        { symbol: 'Ü', decimal: '0220', hex: '00DC', entity: '&Uuml;', name: '分音符 U' },
        { symbol: 'ß', decimal: '0223', hex: '00DF', entity: '&szlig;', name: '清音 s' },
        { symbol: 'à', decimal: '0224', hex: '00E0', entity: '&agrave;', name: '抑音符 a' },
        { symbol: 'á', decimal: '0225', hex: '00E1', entity: '&aacute;', name: '锐音符 a' },
        { symbol: 'â', decimal: '0226', hex: '00E2', entity: '&acirc;', name: '扬抑符 a' },
        { symbol: 'ã', decimal: '0227', hex: '00E3', entity: '&atilde;', name: '颚化符 a' },
        { symbol: 'ä', decimal: '0228', hex: '00E4', entity: '&auml;', name: '分音符 a' },
        { symbol: 'å', decimal: '0229', hex: '00E5', entity: '&aring;', name: '分音符 a' },
        { symbol: 'æ', decimal: '0230', hex: '00E6', entity: '&aelig;', name: '连字ae' },
        { symbol: 'ç', decimal: '0231', hex: '00E7', entity: '&ccedil;', name: '下加符 c' },
        { symbol: 'è', decimal: '0232', hex: '00E8', entity: '&egrave;', name: '抑音符 e' },
        { symbol: 'é', decimal: '0233', hex: '00E9', entity: '&eacute;', name: '锐音符 e' },
        { symbol: 'ê', decimal: '0234', hex: '00EA', entity: '&ecirc;', name: '扬抑符 e' },
        { symbol: 'ë', decimal: '0235', hex: '00EB', entity: '&euml;', name: '分音符 e' },
        { symbol: 'ì', decimal: '0236', hex: '00EC', entity: '&igrave;', name: '抑音符 i' },
        { symbol: 'í', decimal: '0237', hex: '00ED', entity: '&iacute;', name: '锐音符 i' },
        { symbol: 'î', decimal: '0238', hex: '00EE', entity: '&icirc;', name: '扬抑符 i' },
        { symbol: 'ï', decimal: '0239', hex: '00EF', entity: '&iuml;', name: '分音符 i' },
        { symbol: 'ñ', decimal: '0241', hex: '00F1', entity: '&ntilde;', name: '颚化符 n' },
        { symbol: 'ò', decimal: '0242', hex: '00F2', entity: '&ograve;', name: '抑音符 o' },
        { symbol: 'ó', decimal: '0243', hex: '00F3', entity: '&oacute;', name: '锐音符 o' },
        { symbol: 'ô', decimal: '0244', hex: '00F4', entity: '&ocirc;', name: '扬抑符 o' },
        { symbol: 'õ', decimal: '0245', hex: '00F5', entity: '&otilde;', name: '颚化符 o' },
        { symbol: 'ö', decimal: '0246', hex: '00F6', entity: '&ouml;', name: '分音符 o' },
        { symbol: '÷', decimal: '0247', hex: '00F7', entity: '&divide;', name: '除号' },
        { symbol: 'ø', decimal: '0248', hex: '00F8', entity: '&oslash;', name: '带斜线的 o' },
        { symbol: 'ù', decimal: '0249', hex: '00F9', entity: '&ugrave;', name: '抑音符 u' },
        { symbol: 'ú', decimal: '0250', hex: '00FA', entity: '&uacute;', name: '锐音符 u' },
        { symbol: 'û', decimal: '0251', hex: '00FB', entity: '&ucirc;', name: '扬抑符 u' },
        { symbol: 'ü', decimal: '0252', hex: '00FC', entity: '&uuml;', name: '分音符 u' },
        { symbol: 'ÿ', decimal: '0255', hex: '00FF', entity: '&yuml;', name: '分音符 y' }
]
</script>
