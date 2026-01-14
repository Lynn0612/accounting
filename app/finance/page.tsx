'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import dynamic from 'next/dynamic'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import Loading from '@/components/Loading'

// Dynamically import heavy chart components to reduce initial bundle size
// Recharts is a large library (~200KB), so we load it only when needed
// Create a wrapper component that provides chart components
const RechartsWrapper = dynamic(
  () => import('recharts').then((mod) => {
    return function ChartWrapper({ children }: { children: (components: {
      ComposedChart: typeof mod.ComposedChart
      Line: typeof mod.Line
      XAxis: typeof mod.XAxis
      YAxis: typeof mod.YAxis
      Tooltip: typeof mod.Tooltip
      ResponsiveContainer: typeof mod.ResponsiveContainer
    }) => ReactNode }) {
      return children({
        ComposedChart: mod.ComposedChart,
        Line: mod.Line,
        XAxis: mod.XAxis,
        YAxis: mod.YAxis,
        Tooltip: mod.Tooltip,
        ResponsiveContainer: mod.ResponsiveContainer,
      })
    }
  }),
  { 
    ssr: false,
    loading: () => <Loading message="載入圖表中..." size="sm" />
  }
)

// Dynamically import lightweight-charts component (large library ~150KB)
const LightweightCandlestickChart = dynamic(
  () => import('@/components/LightweightCandlestickChart'),
  { 
    ssr: false,
    loading: () => <Loading message="載入圖表中..." size="sm" />
  }
)

interface NewsItem {
  title: string
  link: string
  pubDate: string
  source: string
  image?: string
}

export default function FinancePage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'Stocks' | 'Crypto' | 'Gold' | 'Forex' | '台股' | null>('Stocks')
  const [selectedSymbol, setSelectedSymbol] = useState('SPX')
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [timeframe, setTimeframe] = useState<'1D' | '1W' | '1M' | '1Y'>('1D')
  const [stockPrice, setStockPrice] = useState<{ price: number; change: number; changePercent: number } | null>({ price: 4120.50, change: 0, changePercent: 0 })
  const [priceLoading, setPriceLoading] = useState(false)
  const [priceAnimation, setPriceAnimation] = useState<'up' | 'down' | null>(null)
  const [chartData, setChartData] = useState<Array<{ time: string; value: number; open?: number; high?: number; low?: number; close?: number }>>([])
  const [chartLoading, setChartLoading] = useState(false)
  const [tradingViewSrc, setTradingViewSrc] = useState<string | null>(null)
  const chartContainerRef = useRef<HTMLDivElement>(null)

  const symbolMap: Record<string, string> = {
    'Stocks': 'SPX',
    'Crypto': 'BTC',
    'Gold': 'XAUUSD',
    'Forex': 'USD',
    '台股': 'TAIEX'
  }
  
  const exchangeMap: Record<string, string> = {
    'Stocks': 'INDEX',
    'Crypto': 'CRYPTO',
    'Gold': 'FOREX',
    'Forex': 'FOREX',
    '台股': 'INDEX'
  }

  const stockSuggestions = [
    { symbol: '0050', name: '台灣元大', fullName: '0050 台灣元大', exchange: 'TWSE', tradingViewSymbol: 'TWSE:0050' },
    { symbol: '0056', name: '元大高股息', fullName: '0056 元大高股息', exchange: 'TWSE', tradingViewSymbol: 'TWSE:0056' },
    { symbol: '2330', name: '台積電', fullName: '2330 台積電', exchange: 'TWSE', tradingViewSymbol: 'TWSE:2330' },
    { symbol: '2317', name: '鴻海', fullName: '2317 鴻海', exchange: 'TWSE', tradingViewSymbol: 'TWSE:2317' },
    { symbol: '2454', name: '聯發科', fullName: '2454 聯發科', exchange: 'TWSE', tradingViewSymbol: 'TWSE:2454' },
    { symbol: '2308', name: '台達電', fullName: '2308 台達電', exchange: 'TWSE', tradingViewSymbol: 'TWSE:2308' },
    { symbol: '1301', name: '台塑', fullName: '1301 台塑', exchange: 'TWSE', tradingViewSymbol: 'TWSE:1301' },
    { symbol: '1303', name: '南亞', fullName: '1303 南亞', exchange: 'TWSE', tradingViewSymbol: 'TWSE:1303' },
    { symbol: 'AAPL', name: 'Apple Inc.', fullName: 'AAPL Apple Inc.', exchange: 'NASDAQ', tradingViewSymbol: 'NASDAQ:AAPL' },
    { symbol: 'MSFT', name: 'Microsoft', fullName: 'MSFT Microsoft', exchange: 'NASDAQ', tradingViewSymbol: 'NASDAQ:MSFT' },
    { symbol: 'GOOGL', name: 'Alphabet', fullName: 'GOOGL Alphabet', exchange: 'NASDAQ', tradingViewSymbol: 'NASDAQ:GOOGL' },
    { symbol: 'AMZN', name: 'Amazon', fullName: 'AMZN Amazon', exchange: 'NASDAQ', tradingViewSymbol: 'NASDAQ:AMZN' },
    { symbol: 'TSLA', name: 'Tesla', fullName: 'TSLA Tesla', exchange: 'NASDAQ', tradingViewSymbol: 'NASDAQ:TSLA' },
    { symbol: 'BTC', name: 'Bitcoin', fullName: 'BTC Bitcoin', exchange: 'CRYPTO', tradingViewSymbol: 'BINANCE:BTCUSDT' },
    { symbol: 'BTCUSD', name: 'Bitcoin', fullName: 'BTCUSD Bitcoin', exchange: 'CRYPTO', tradingViewSymbol: 'BINANCE:BTCUSDT' },
    { symbol: 'ETH', name: 'Ethereum', fullName: 'ETH Ethereum', exchange: 'CRYPTO', tradingViewSymbol: 'BINANCE:ETHUSDT' },
    { symbol: 'ETHUSD', name: 'Ethereum', fullName: 'ETHUSD Ethereum', exchange: 'CRYPTO', tradingViewSymbol: 'BINANCE:ETHUSDT' },
    { symbol: 'XAUUSD', name: 'Gold', fullName: 'XAUUSD Gold', exchange: 'FOREX', tradingViewSymbol: 'FX:XAUUSD' },
    { symbol: 'EURUSD', name: 'Euro/Dollar', fullName: 'EURUSD Euro/Dollar', exchange: 'FOREX', tradingViewSymbol: 'FX:EURUSD' },
    { symbol: 'USD', name: 'US Dollar Index', fullName: 'USD US Dollar Index', exchange: 'FOREX', tradingViewSymbol: 'TVC:DXY' },
    { symbol: 'SPX', name: 'S&P 500', fullName: 'SPX S&P 500', exchange: 'INDEX', tradingViewSymbol: 'SPX' },
    { symbol: 'SPY', name: 'SPDR S&P 500 ETF', fullName: 'SPY SPDR S&P 500 ETF', exchange: 'INDEX', tradingViewSymbol: 'SPY' },
    { symbol: 'TAIEX', name: '台股加權指數', fullName: 'TAIEX 台股加權指數', exchange: 'INDEX', tradingViewSymbol: 'TWSE:TAIEX' },
  ]

  const [showSuggestions, setShowSuggestions] = useState(false)
  const [currentTradingViewSymbol, setCurrentTradingViewSymbol] = useState('SPX')

  const loadNews = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/news`, {
        next: { revalidate: 300 }
      })
      if (response.ok) {
        const data = await response.json()
        setNews(data.items || [])
      }
    } catch (error) {
      console.error('Error loading news:', error)
      setNews([])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadStockPrice = useCallback(async () => {
    const suggestion = stockSuggestions.find(s => s.symbol === selectedSymbol)
    let exchange = suggestion?.exchange
    
    if (!suggestion) {
      exchange = exchangeMap[activeTab] || 'INDEX'
    }
    
    if (!exchange || (exchange !== 'TWSE' && exchange !== 'FOREX' && exchange !== 'CRYPTO' && exchange !== 'INDEX')) {
      setStockPrice(null)
      return
    }

    setPriceLoading(true)
    try {
      const response = await fetch(`/api/stock-price?symbol=${selectedSymbol}&exchange=${exchange}`, {
        cache: 'force-cache',
        next: { revalidate: 30 }
      })
      if (response.ok) {
        const data = await response.json()
        const newPrice = data.price || 0
        const newChangePercent = data.changePercent || 0
        
        setStockPrice(prev => {
          if (prev) {
            if (newPrice > prev.price) {
              setPriceAnimation('up')
              setTimeout(() => setPriceAnimation(null), 1000)
            } else if (newPrice < prev.price) {
              setPriceAnimation('down')
              setTimeout(() => setPriceAnimation(null), 1000)
            }
          }
          return {
            price: newPrice,
            change: data.change || 0,
            changePercent: newChangePercent
          }
        })
      }
    } catch (error) {
      console.error('Error loading stock price:', error)
      setStockPrice(null)
    } finally {
      setPriceLoading(false)
    }
  }, [selectedSymbol, activeTab])

  const loadChartData = useCallback(async () => {
    const suggestion = stockSuggestions.find(s => s.symbol === selectedSymbol)
    let exchange = suggestion?.exchange
    
    if (!suggestion) {
      exchange = exchangeMap[activeTab] || 'INDEX'
    }
    
    if (!exchange || (exchange !== 'TWSE' && exchange !== 'FOREX' && exchange !== 'CRYPTO' && exchange !== 'INDEX')) {
      setChartData([])
      return
    }

    setChartLoading(true)
    try {
      const response = await fetch(`/api/stock-chart?symbol=${selectedSymbol}&exchange=${exchange}&timeframe=${timeframe}`, {
        cache: 'force-cache',
        next: { revalidate: 300 }
      })
      if (response.ok) {
        const data = await response.json()
        setChartData(data.data || [])
      }
    } catch (error) {
      console.error('Error loading chart data:', error)
      setChartData([])
    } finally {
      setChartLoading(false)
    }
  }, [selectedSymbol, activeTab, timeframe])

  useEffect(() => {
    const timer = setTimeout(() => {
      loadNews()
    }, 100)
    return () => clearTimeout(timer)
  }, [loadNews])

  useEffect(() => {
    if (activeTab) {
      const symbol = symbolMap[activeTab] || 'SPX'
      const exchange = exchangeMap[activeTab] || 'INDEX'
      setSelectedSymbol(symbol)
      const suggestion = stockSuggestions.find(s => s.symbol === symbol && s.exchange === exchange)
      if (suggestion) {
        setCurrentTradingViewSymbol(suggestion.tradingViewSymbol)
      } else {
        setCurrentTradingViewSymbol(symbol)
      }
    }
  }, [activeTab])

  useEffect(() => {
    const controller = new AbortController()
    
    Promise.all([loadStockPrice(), loadChartData()])
    
    const priceInterval = setInterval(() => {
      loadStockPrice()
    }, 60000)
    
    return () => {
      controller.abort()
      clearInterval(priceInterval)
    }
  }, [selectedSymbol, activeTab, timeframe, loadStockPrice, loadChartData])

  useEffect(() => {
    const suggestion = stockSuggestions.find(s => s.symbol === selectedSymbol)
    if (suggestion && (suggestion.exchange === 'TWSE' || suggestion.exchange === 'FOREX')) {
      setTradingViewSrc(null)
      return
    }

    const interval = timeframe === '1D' ? 'D' : timeframe === '1W' ? 'W' : timeframe === '1M' ? 'M' : timeframe === '1Y' ? '12M' : '1'
    const iframeSrc = `https://www.tradingview.com/widgetembed/?symbol=${encodeURIComponent(currentTradingViewSymbol)}&interval=${interval}&theme=light&style=1&locale=en&toolbar_bg=f1f3f6&enable_publishing=false&hide_top_toolbar=true&hide_legend=false&save_image=false&height=160&width=100%25`
    setTradingViewSrc(iframeSrc)
  }, [currentTradingViewSymbol, timeframe, selectedSymbol])

  const formatRelativeTime = (dateString: string) => {
    if (!dateString) return ''
    
    let date: Date
    try {
      date = new Date(dateString)
      if (isNaN(date.getTime())) {
        return dateString
      }
    } catch {
      return dateString
    }
    
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    
    if (diffMs < 0) {
      return '剛剛'
    }
    
    if (diffMs < 60000) {
      return '剛剛'
    }
    
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays > 7) {
      return date.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
    } else if (diffDays > 0) {
      return `${diffDays}天前`
    } else if (diffHours > 0) {
      return `${diffHours}小時前`
    } else if (diffMins > 0) {
      return `${diffMins}分鐘前`
    } else {
      return '剛剛'
    }
  }

  const filteredSuggestionsMemo = useMemo(() => {
    if (searchQuery.length === 0) return []
    const query = searchQuery.toLowerCase()
    return stockSuggestions.filter(
      item => 
        item.symbol.toLowerCase().includes(query) ||
        item.name.toLowerCase().includes(query) ||
        item.fullName.toLowerCase().includes(query)
    )
  }, [searchQuery])

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query)
    if (query.length > 0) {
      setShowSuggestions(true)
    } else {
      setShowSuggestions(false)
    }
  }, [])

  const handleSelectSuggestion = useCallback((suggestion: typeof stockSuggestions[0]) => {
    setSearchQuery(suggestion.fullName)
    setSelectedSymbol(suggestion.symbol)
    setCurrentTradingViewSymbol(suggestion.tradingViewSymbol)
    setShowSuggestions(false)
    setActiveTab(null)
  }, [])

  return (
    <div className="relative mx-auto w-full max-w-md bg-background-light min-h-screen flex flex-col overflow-x-hidden">
      <header className="sticky top-0 z-10 bg-background-light/90 backdrop-blur-md px-6 pt-12 pb-4 flex items-center justify-center">
        <h1 className="text-lg font-bold text-text-main">Market Overview</h1>
      </header>

      <section className="px-6 space-y-4 mb-6">
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="w-5 h-5 text-text-secondary" />
          </div>
          <input
            className="block w-full pl-12 pr-4 py-3.5 bg-white border-none rounded-full text-text-main placeholder-text-secondary focus:ring-2 focus:ring-primary/20 shadow-sm text-sm font-medium transition-all"
            placeholder="Search tickers or news..."
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => {
              if (searchQuery.length > 0) {
                setShowSuggestions(true)
              }
            }}
            onBlur={() => {
              setTimeout(() => setShowSuggestions(false), 200)
            }}
          />
          {showSuggestions && filteredSuggestionsMemo.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-lg border border-gray-100 max-h-64 overflow-y-auto z-50">
              {filteredSuggestionsMemo.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSelectSuggestion(suggestion)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center justify-between border-b border-gray-50 last:border-b-0"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-text-main">{suggestion.symbol}</span>
                    <span className="text-xs text-text-secondary">{suggestion.name}</span>
                  </div>
                  <span className="material-symbols-outlined text-text-secondary text-lg">arrow_forward</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
          {(['Stocks', 'Crypto', 'Gold', 'Forex', '台股'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab)
                setSearchQuery('')
              }}
              className={`flex-shrink-0 px-5 py-2.5 text-sm font-medium rounded-full shadow-sm transition-all active:scale-95 border ${
                activeTab === tab && selectedSymbol === (symbolMap[tab] || '')
                  ? 'bg-primary text-white font-bold shadow-md shadow-primary/20 border-transparent'
                  : 'bg-white text-text-secondary hover:bg-gray-50 border-transparent hover:border-gray-100'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </section>

      <section className="px-6 mb-8">
        <div className="bg-white rounded-[24px] p-6 shadow-sm w-full relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <div className="flex flex-col flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center p-1.5">
                  <span className="text-xs font-bold text-text-secondary">{selectedSymbol}</span>
                </span>
                <span className="text-text-secondary text-sm font-semibold tracking-wide">
                  {stockSuggestions.find(s => s.symbol === selectedSymbol)?.name || selectedSymbol}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-extrabold tracking-tight text-blue-600">
                  {stockPrice ? (
                    `$${stockPrice.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  ) : priceLoading ? (
                    <Loading message="載入中..." size="sm" />
                  ) : (
                    '$4,120.50'
                  )}
                </h2>
                {chartData.length > 0 && chartData[0]?.open !== undefined && (
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-white/90 backdrop-blur-sm rounded-md shadow-sm">
                    <div className="w-3 h-0.5 bg-blue-500"></div>
                    <span className="text-xs font-medium text-gray-700">20MA</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <p className="text-text-secondary text-xs font-medium mb-6">Global Markets • Index</p>
          <div ref={chartContainerRef} className="h-64 w-full mb-6 relative">
            {(() => {
              const suggestion = stockSuggestions.find(s => s.symbol === selectedSymbol)
              const exchange = suggestion?.exchange || exchangeMap[activeTab] || 'INDEX'
              const useCustomChart = exchange === 'TWSE' || exchange === 'FOREX' || exchange === 'CRYPTO' || exchange === 'INDEX'
              
              if (useCustomChart) {
                if (chartLoading) {
                  return (
                    <div className="w-full h-full flex items-center justify-center">
                      <Loading message="載入圖表中..." size="sm" />
                    </div>
                  )
                } else if (chartData.length > 0) {
                  const hasOHLC = chartData[0]?.open !== undefined && chartData[0]?.high !== undefined
                  
                  if (hasOHLC) {
                    return <LightweightCandlestickChart data={chartData as any} />
                  } else {
                    return (
                      <RechartsWrapper>
                        {({ ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer }) => (
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 20 }}>
                              <XAxis 
                                dataKey="time" 
                                tick={{ fontSize: 9, fill: '#666' }}
                                interval="preserveStartEnd"
                              />
                              <YAxis 
                                tick={{ fontSize: 9, fill: '#666' }}
                                domain={['auto', 'auto']}
                              />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: 'white',
                                  border: 'none',
                                  borderRadius: '8px',
                                  padding: '8px 12px',
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                }}
                                formatter={(value: number) => [`$${value.toFixed(2)}`, '價格']}
                                labelFormatter={(label) => `日期: ${label}`}
                              />
                              <Line
                                type="monotone"
                                dataKey="value"
                                stroke="#4A90E2"
                                strokeWidth={2}
                                dot={false}
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                        )}
                      </RechartsWrapper>
                    )
                  }
                } else {
                  return (
                    <div className="w-full h-full flex items-center justify-center text-text-secondary text-sm">
                      Chart not available
                    </div>
                  )
                }
              } else {
                if (tradingViewSrc) {
                  return (
                    <iframe
                      src={tradingViewSrc}
                      style={{ width: '100%', height: '160px', border: 'none' }}
                      scrolling="no"
                      allowTransparency={true}
                      loading="lazy"
                    />
                  )
                } else {
                  return (
                    <div className="w-full h-full flex items-center justify-center text-text-secondary text-sm">
                      Loading chart...
                    </div>
                  )
                }
              }
            })()}
          </div>
          <div className="flex justify-between bg-background-light rounded-full p-1.5 mx-auto max-w-[280px]">
            {(['1D', '1W', '1M', '1Y'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`flex-1 py-1.5 text-xs text-center rounded-full transition-colors ${
                  timeframe === tf
                    ? 'font-bold text-text-main bg-white shadow-sm'
                    : 'font-medium text-text-secondary hover:text-text-main'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="flex-1 bg-white rounded-t-[32px] px-6 pt-8 pb-32 shadow-[0_-4px_20px_rgba(0,0,0,0.02)] border-t border-gray-100">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-text-main">Latest News</h3>
        </div>
        <div className="flex flex-col gap-5">
          {loading ? (
            <Loading message="載入新聞中..." size="sm" />
          ) : news.length > 0 ? (
            news.map((item, index) => (
              <div key={index}>
                <article 
                  className="group flex gap-4 items-start cursor-pointer"
                  onClick={() => window.open(item.link, '_blank', 'noopener,noreferrer')}
                >
                  <div className="flex-1 flex flex-col justify-between py-1">
                    <h4 className="text-base font-bold text-text-main leading-snug line-clamp-2 group-hover:text-primary transition-colors mb-2">
                      {item.title}
                    </h4>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-background-light rounded-md text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                        {item.source}
                      </span>
                      <span className="text-xs text-text-secondary">• {formatRelativeTime(item.pubDate)}</span>
                    </div>
                  </div>
                </article>
                {index < news.length - 1 && <div className="h-px bg-gray-100 w-full"></div>}
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-text-secondary">No news available</div>
          )}
        </div>
      </section>

      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] max-w-md h-16 bg-white rounded-full shadow-float flex items-center justify-around px-2 z-20">
        <Link
          href="/"
          className="flex flex-col items-center justify-center w-12 h-12 rounded-full text-gray-400 hover:text-primary hover:bg-gray-50 transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>home</span>
        </Link>
        <Link
          href="/statistics"
          className="flex flex-col items-center justify-center w-12 h-12 rounded-full text-gray-400 hover:text-primary hover:bg-gray-50 transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>pie_chart</span>
        </Link>
        <div className="w-12"></div>
        <div className="flex flex-col items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary pointer-events-none">
          <span className="material-symbols-outlined filled" style={{ fontVariationSettings: "'FILL' 1", fontSize: "24px" }}>
            account_balance_wallet
          </span>
        </div>
        <Link
          href="/settings"
          className="flex flex-col items-center justify-center w-12 h-12 rounded-full text-gray-400 hover:text-primary hover:bg-gray-50 transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>settings</span>
        </Link>
        <div className="absolute -top-6 left-1/2 -translate-x-1/2">
          <Link
            href="/add"
            className="w-14 h-14 bg-primary text-white rounded-full shadow-lg shadow-primary/40 flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "28px" }}>add</span>
          </Link>
        </div>
      </nav>
    </div>
  )
}


