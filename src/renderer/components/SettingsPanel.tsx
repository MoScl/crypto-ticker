import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import type { AppLanguage, DataSource, QuoteAsset, RefreshMode } from '../../shared/types';
import { SOURCE_LABELS } from '../../shared/constants';

interface Props {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: Props) {
  const { t, lang } = useI18n();
  const config = useAppStore((s) => s.config);
  const patchConfig = useAppStore((s) => s.patchConfig);
  const setClickThrough = useAppStore((s) => s.setClickThrough);
  const setAutoStart = useAppStore((s) => s.setAutoStart);
  const networkStatus = useAppStore((s) => s.networkStatus);
  const sourceStatus = useAppStore((s) => s.sourceStatus);

  // 透明度本地态：拖动结束才回写（P7 防抖，避免频繁重连）
  const [opacity, setOpacity] = useState(config.opacity);
  useEffect(() => setOpacity(config.opacity), [config.opacity]);

  // 穿透态下打开设置面板：窗口必须保持可交互，否则面板会被鼠标穿透锁死。
  // 面板挂载 → 通知主进程保持整窗交互；面板卸载（关闭）→ 恢复穿透判定。
  useEffect(() => {
    if (config.clickThrough) api.setClickThroughHold(true);
    return () => api.setClickThroughHold(false);
  }, [config.clickThrough]);

  const commitOpacity = () => {
    if (opacity !== config.opacity) patchConfig({ opacity });
  };

  // 网络状态展示辅助
  const netOnline = networkStatus?.online ?? null;
  const netType =
    !networkStatus ? t('netStateProbing')
    : networkStatus.type === 'wifi' ? t('netTypeWifi')
    : networkStatus.type === 'ethernet' ? t('netTypeEthernet')
    : t('netTypeUnknown');
  const netStateText =
    netOnline === null ? t('netStateProbing')
    : !netOnline ? t('netStateOffline')
    : networkStatus?.reachable
      ? networkStatus.degraded ? t('netStateOnlineLimited') : t('netStateOnline')
      : t('netStateOnlineTimeout');
  const netStateClass =
    netOnline === null ? 'pending'
    : !netOnline ? 'offline'
    : networkStatus?.reachable
      ? networkStatus.degraded ? 'degraded' : 'online'
      : 'degraded';
  const srcName = sourceStatus ? SOURCE_LABELS[sourceStatus.source]?.[lang] ?? sourceStatus.source : '';
  const srcStateName = !sourceStatus
    ? t('commonWaiting')
    : !sourceStatus.ok
      ? t('commonAbnormal')
      : sourceStatus.degraded
        ? t('commonDegraded')
        : t('commonNormal');
  const srcText = !sourceStatus
    ? t('commonWaiting')
    : t('netSrcText', { label: srcName, state: srcStateName });
  const netTime = networkStatus
    ? new Date(networkStatus.ts).toLocaleTimeString('zh-CN', { hour12: false })
    : t('commonDash');
  // 出口方式摘要
  const egressText = !networkStatus?.egress
    ? t('netEgressProbing')
    : networkStatus.egress.mode === 'proxy'
      ? t('netEgressProxy', { url: networkStatus.egress.proxyUrl, ms: networkStatus.egress.latencyMs })
      : networkStatus.egress.latencyMs >= 0
        ? t('netEgressDirect')
        : t('netEgressNone');
  // DNS 状态摘要
  const dnsText = networkStatus == null ? t('netStateProbing') : networkStatus.dnsBlocked ? t('netDnsBlocked') : t('netDnsOk');
  const lastErr = networkStatus?.lastError ?? null;

  return (
    <div className="settings-overlay no-drag" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span>{t('setTitle')}</span>
          <button className="icon-btn" title={t('commonClose')} onClick={onClose}>
            ×
          </button>
        </div>

        <div className="settings-body">
          <label className="row">
            <span>{t('setLang')}</span>
            <select
              value={config.language}
              onChange={(e) => patchConfig({ language: e.target.value as AppLanguage })}
            >
              <option value="zh">{t('langZh')}</option>
              <option value="en">{t('langEn')}</option>
            </select>
          </label>

          <label className="row">
            <span>{t('setSource')}</span>
            <select
              value={config.dataSource}
              onChange={(e) => patchConfig({ dataSource: e.target.value as DataSource })}
            >
              <option value="auto">{t('setDsAuto')}</option>
              <option value="okx">{t('setDsOkx')}</option>
              <option value="binance">{t('setDsBinance')}</option>
              <option value="bybit">{t('setDsBybit')}</option>
              <option value="gate">{t('setDsGate')}</option>
              <option value="coingecko">{t('setDsCoingecko')}</option>
            </select>
          </label>

          <label className="row">
            <span>{t('setQuote')}</span>
            <select
              value={config.quoteAsset}
              onChange={(e) => patchConfig({ quoteAsset: e.target.value as QuoteAsset })}
            >
              <option value="USDT">USDT</option>
              <option value="USDC">USDC</option>
              <option value="FDUSD">FDUSD</option>
            </select>
          </label>

          <label className="row">
            <span>{t('setProxy')}</span>
            <input
              className="text-input"
              placeholder={t('setProxyPlaceholder')}
              defaultValue={config.proxyUrl ?? ''}
              onBlur={(e) => patchConfig({ proxyUrl: e.target.value.trim() || undefined })}
            />
          </label>
          <div className="net-hint">{t('setProxyHint')}</div>

          <label className="row">
            <span>{t('setRefreshMode')}</span>
            <select
              value={config.refreshMode}
              onChange={(e) => patchConfig({ refreshMode: e.target.value as RefreshMode })}
            >
              <option value="realtime">{t('setModeRealtime')}</option>
              <option value="poll">{t('setModePoll')}</option>
            </select>
          </label>

          <label className="row">
            <span>{t('setInterval')}</span>
            <input
              className="text-input"
              type="number"
              min={5}
              max={3600}
              value={config.refreshIntervalSec}
              onChange={(e) =>
                patchConfig({ refreshIntervalSec: Math.max(5, Number(e.target.value) || 15) })
              }
            />
          </label>

          <label className="row">
            <span>{t('setOpacity', { pct: Math.round(opacity * 100) })}</span>
            <input
              type="range"
              min={0.3}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              onMouseUp={commitOpacity}
              onTouchEnd={commitOpacity}
              onKeyUp={commitOpacity}
            />
          </label>

          <div className="net-section">
            <div className="net-section-title">{t('setNetTitle')}</div>
            <div className="net-grid">
              <div className="net-item">
                <span className="net-key">{t('setKeyConn')}</span>
                <span className={`net-val net-state ${netStateClass}`}>{netStateText}</span>
              </div>
              <div className="net-item">
                <span className="net-key">{t('netKeyType')}</span>
                <span className="net-val">{netType}</span>
              </div>
              <div className="net-item">
                <span className="net-key">{t('netKeyIface')}</span>
                <span className="net-val">{networkStatus?.interfaceName ?? t('commonDash')}</span>
              </div>
              <div className="net-item">
                <span className="net-key">{t('netKeyIpv4')}</span>
                <span className="net-val">{networkStatus?.ipv4 ?? t('commonDash')}</span>
              </div>
              <div className="net-item">
                <span className="net-key">{t('netKeySource')}</span>
                <span className="net-val">{srcText}</span>
              </div>
              <div className="net-item">
                <span className="net-key">{t('netKeyEgress')}</span>
                <span className="net-val">{egressText}</span>
              </div>
              <div className="net-item">
                <span className="net-key">{t('netKeyDns')}</span>
                <span className={`net-val${networkStatus?.dnsBlocked ? ' net-warn' : ''}`}>{dnsText}</span>
              </div>
              {lastErr && (
                <div className="net-item">
                  <span className="net-key">{t('netKeyError')}</span>
                  <span className="net-val net-warn">{lastErr}</span>
                </div>
              )}
              <div className="net-item">
                <span className="net-key">{t('netKeyTime')}</span>
                <span className="net-val">{netTime}</span>
              </div>
            </div>
          </div>

          <label className="row-check">
            <input
              type="checkbox"
              checked={config.alwaysOnTop}
              onChange={(e) => patchConfig({ alwaysOnTop: e.target.checked })}
            />
            <span>{t('setAlwaysOnTop')}</span>
          </label>

          <label className="row-check">
            <input
              type="checkbox"
              checked={config.clickThrough}
              onChange={(e) => {
                setClickThrough(e.target.checked);
                if (e.target.checked) {
                  // 开启后窗口将忽略鼠标事件，设置面板会无法点击：短暂提示后自动关闭，
                  // 之后通过托盘菜单 / 全局快捷键 / 窗口内悬浮按钮退出穿透
                  setTimeout(onClose, 900);
                }
              }}
            />
            <span>{t('setClickThrough')}</span>
          </label>
          <div className={`ct-hint${config.clickThrough ? ' on' : ''}`}>
            {config.clickThrough ? t('setCtHintOn') : t('setCtHintOff')}
          </div>

          <label className="row-check">
            <input
              type="checkbox"
              checked={config.minimalMode}
              onChange={(e) => patchConfig({ minimalMode: e.target.checked })}
            />
            <span>{t('setMinimalMode')}</span>
          </label>
          <div className={`ct-hint${config.minimalMode ? ' on' : ''}`}>
            {t('setMinimalModeHint')}
          </div>

          <label className="row-check">
            <input
              type="checkbox"
              checked={config.autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
            />
            <span>{t('setAutoStart')}</span>
          </label>
        </div>

        <div className="settings-footer">
          <span className="hint">{t('commonMonitoring', { count: config.watchlist.length })}</span>
          <div className="footer-actions">
            <button className="add-btn" onClick={onClose}>
              {t('setDone')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
