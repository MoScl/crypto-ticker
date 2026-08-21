import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../i18n';
import type { Dict } from '../i18n';

type TFunc = (key: keyof Dict, params?: Record<string, string | number>) => string;

/**
 * 数据刷新时间格式化（按用户规则）：
 * - 小于等于 60 秒 => 按秒显示（如 "30秒"）
 * - 超过 60 秒但小于等于 60 分钟 => 按分钟显示（如 "5分钟"）
 * - 超过 60 分钟 => 按小时显示（如 "1小时"）
 */
export function formatRefreshTime(elapsedSec: number, t: TFunc): string {
  if (elapsedSec <= 0) return t('refreshJustNow');
  if (elapsedSec <= 60) return t('refreshSec', { n: Math.floor(elapsedSec) });
  if (elapsedSec <= 3600) return t('refreshMin', { n: Math.floor(elapsedSec / 60) });
  return t('refreshHour', { n: Math.floor(elapsedSec / 3600) });
}

/**
 * 数据刷新时间指示：显示「更新于 X 前」。
 * 每秒刷新一次，取 store 中最近一次行情数据的到达时间与当前时间之差。
 */
export function RefreshTime() {
  const { t } = useI18n();
  const lastUpdateTs = useAppStore((s) => s.lastUpdateTs);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsed = lastUpdateTs > 0 ? Math.floor((now - lastUpdateTs) / 1000) : -1;
  return (
    <span className="refresh-time" title={t('refreshTitle')}>
      {elapsed < 0 ? t('commonWaiting') : t('commonUpdatedAgo', { time: formatRefreshTime(elapsed, t) })}
    </span>
  );
}
