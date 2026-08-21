import { api } from '../lib/api';
import { PLATFORMS } from '../data/platforms';
import { useI18n } from '../i18n';

interface Props {
  symbol: string;
  coingeckoId?: string;
}

/**
 * 平台跳转条（公共组件）：
 * 浏览币种榜单弹窗（AddCoinModal）与自选列表（CoinRow）共用。
 * 品牌色圆点 + 平台名按钮，点击直接打开对应币种交易页，UI 与交互完全一致。
 */
export function PlatformBar({ symbol, coingeckoId }: Props) {
  const { t } = useI18n();
  return (
    <div className="platform-bar" onClick={(e) => e.stopPropagation()}>
      <span className="platform-label">{t('platformView')}</span>
      {PLATFORMS.map((p) => (
        <button
          key={p.id}
          className="plat-btn"
          title={p.build(symbol, coingeckoId)}
          onClick={() => api.openExternal(p.build(symbol, coingeckoId))}
        >
          <span className="plat-dot" style={{ background: p.color }} />
          {p.label}
        </button>
      ))}
    </div>
  );
}
