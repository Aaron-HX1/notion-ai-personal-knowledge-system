import {expect,it} from 'vitest';
import {renderTrendChart} from '../public/trend-chart.js';
it('shows a useful empty state when every count is zero',()=>{const html=renderTrendChart([{period:'2026-10-30',kind:'import',count:0}]);expect(html).toContain('暂无趋势数据');expect(html).not.toContain('trend-group');});
it('renders three accessible bars and exact values for actual data',()=>{const html=renderTrendChart([{period:'2026-10-30',kind:'import',count:3},{period:'2026-10-30',kind:'learn',count:2},{period:'2026-10-30',kind:'deploy',count:1}]);expect(html).toContain('导入 3，已学习 2，已部署 1');expect(html.match(/class="trend-column /g)).toHaveLength(3);expect(html).toContain('2026-10-30');});
