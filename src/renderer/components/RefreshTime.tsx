import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../i18n';
import type { Dict } from '../i18n';

type TFunc = (key: keyof Dict, params?: Record<string, string | number>) => string;

/**
 * 数据刷新时间格式化，返回**完整短语**（已自带「前 / ago」）：
 * - 0 秒（含刚启动）=> "刚刚"
 * - 小于等于 60 秒    => "30秒前"
 * - 60 秒 ~ 60 分钟   => "5分钟前"
 * - 超过 60 分钟      => "2小时前"
 *
 * 注意：调用方直接渲染返回值即可，不要再套「更新于 … 前」，
 * 否则会拼出「更新于刚刚前」这种病句（状态栏空间紧张，也放不下长文案）。
 */
export function formatUpdatedAgo(elapsedSec: number, t: TFunc): string {
  if (elapsedSec <= 0) return t('refreshJustNow');
  if (elapsedSec <= 60) return t('refreshSec', { n: Math.floor(elapsedSec) });
  if (elapsedSec <= 3600) return t('refreshMin', { n: Math.floor(elapsedSec / 60) });
  return t('refreshHour', { n: Math.floor(elapsedSec / 3600) });
}

/**
 * 数据刷新时间指示：显示「刚刚 / 5秒前 / 3分钟前」。
 * 每秒刷新一次，取 store 中最近一次行情数据的到达时间与当前时间之差。
 */
export function RefreshTime() {
  const { t } = useI18n();
  const lastUpdateTs = useAppStore((s) => s.lastUpdateTs);
  // 「有数据」以 tickers 为准，而不是只看时间戳：
  // 只要 store 里进过任意一条行情，就算有数据，绝不再回落到「等待数据…」。
  const hasTickers = useAppStore((s) => Object.keys(s.tickers).length > 0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 「等待数据…」的唯一出口：store 里一条行情都没有（首次启动那几秒）。
  // 一旦有数据，无论之后断网、降级、重连多久，都只显示「X 前」，
  // 不再回到等待态——用户看到的是"数据有多旧"，而不是"在等"。
  const hasData = hasTickers || lastUpdateTs > 0;
  const elapsed = lastUpdateTs > 0 ? Math.floor((now - lastUpdateTs) / 1000) : -1;
  return (
    <span className="refresh-time" title={t('refreshTitle')}>
      {/* 极端兜底：有数据但时间戳缺失（历史/异常数据）时不显示等待数据，按「刚刚」处理 */}
      {elapsed >= 0
        ? formatUpdatedAgo(elapsed, t)
        : hasData
          ? t('refreshJustNow')
          : t('commonWaiting')}
    </span>
  );
}
