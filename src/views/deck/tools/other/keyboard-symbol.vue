<template>
  <tool-shell title="键盘符号读法" desc="键盘符号的中英文读法对照" icon="keyboard" color="#FAAD14" back-path="/tools/other">
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

// 键盘符号读法速查：数据迁移自旧项目 keyboardSymbol 模块
defineOptions({ name: 'OtherKeyboardSymbol' })

const columns = [
        { key: 'symbol', title: '符号', tag: true },
        { key: 'zh', title: '中文' },
        { key: 'en', title: '英文' }
]

const rows = [
        { symbol: '~', zh: '波浪号', en: 'tilde' },
        { symbol: '`', zh: '反引号,重音号', en: 'backquote,backtick,grave accent' },
        { symbol: '#', zh: '井号', en: 'number sign,pound sign,hash mark' },
        { symbol: '#!', zh: '', en: 'sha-bang' },
        { symbol: '|', zh: '竖线', en: 'pipe,vertical bar' },
        { symbol: '\'', zh: '单引号', en: 'single quote' },
        { symbol: '"', zh: '双引号', en: 'double quote,quotation mark' },
        { symbol: '$', zh: '美元符号', en: 'dollar sign' },
        { symbol: '.', zh: '点,句号', en: 'dot,period,point' },
        { symbol: '!', zh: '感叹号', en: 'exclamation mark,bang' },
        { symbol: '%', zh: '百分号,取余', en: 'percent,mod' },
        { symbol: '@', zh: '艾特', en: 'at symbol' },
        { symbol: '°', zh: '度数', en: 'degree' },
        { symbol: '*', zh: '星号,乘号', en: 'asterisk,star,multiplication symbol' },
        { symbol: '(', zh: '左圆括号,左小括号', en: 'open parenthesis' },
        { symbol: '((', zh: '', en: 'double parentheses' },
        { symbol: '&', zh: 'and符号,和', en: 'and symbol' },
        { symbol: '[', zh: '左方括号,左中括号', en: 'open bracket' },
        { symbol: '[[', zh: '', en: 'double brackets' },
        { symbol: '{', zh: '左大括号,左花括号', en: 'curly brace,curly bracket,brace' },
        { symbol: '=', zh: '等号', en: 'equal' },
        { symbol: '+', zh: '加号', en: 'plus' },
        { symbol: '-', zh: '减号,连字符', en: 'minus,hyphen' },
        { symbol: '_', zh: '下划线', en: 'underscore,underline' },
        { symbol: '\\', zh: '反斜杠', en: 'backslash,escape' },
        { symbol: '/', zh: '斜杠,除号', en: 'slash,division symbol' },
        { symbol: ':', zh: '冒号', en: 'colon' },
        { symbol: ';', zh: '分号', en: 'semicolon' },
        { symbol: '<', zh: '小于号', en: 'less than sign' },
        { symbol: '>', zh: '大于号', en: 'greater than sign' },
        { symbol: ',', zh: '逗号', en: 'comma' },
        { symbol: '?', zh: '问好', en: 'question mark' },
        { symbol: '^', zh: '折音号', en: 'circumflex,caret' },
        { symbol: '<>', zh: '尖括号', en: 'angle brackets' }
]
</script>
