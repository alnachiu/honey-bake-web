// 导出 CSV 的共用部分。
//
// 两个导出接口（订单、会员卡购买记录）此前各自抄了一遍 BOM + 转义 + 响应头，
// 抽出来避免改动时只改一处导致两边格式漂移。

/**
 * 把表头与数据行拼成 CSV 文本。
 *
 * 每个单元格都强制加引号并把内部引号翻倍，这样商品名里的逗号、备注里的换行
 * 都不会把列冲散。Excel 靠开头的 BOM 识别 UTF-8，否则中文会乱码。
 */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const escape = (cell: string | number) => `"${String(cell ?? '').replace(/"/g, '""')}"`
  const lines = [headers, ...rows].map(row => row.map(escape).join(','))
  return '﻿' + lines.join('\n')
}

/** 带下载文件名的 CSV 响应，文件名带日期后缀便于店主归档 */
export function csvResponse(csv: string, filenamePrefix: string): Response {
  const filename = `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.csv`
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  })
}
