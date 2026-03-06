import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic';

function getYahooSymbol(symbol: string, exchange: string): string {
  if (exchange === 'TWSE') {
    return `${symbol.padStart(4, '0')}.TW`
  } else if (exchange === 'FOREX') {
    if (symbol === 'XAUUSD') {
      return 'GC=F'
    } else if (symbol === 'EURUSD') {
      return 'EURUSD=X'
    } else if (symbol === 'USD') {
      return 'DX-Y.NYB'
    }
    return `${symbol}=X`
  } else if (exchange === 'CRYPTO') {
    if (symbol === 'BTCUSD' || symbol === 'BTC') {
      return 'BTC-USD'
    } else if (symbol === 'ETHUSD' || symbol === 'ETH') {
      return 'ETH-USD'
    }
    return `${symbol}-USD`
  } else if (exchange === 'INDEX') {
    if (symbol === 'SPX') {
      return '^GSPC'
    } else if (symbol === 'SPY') {
      return 'SPY'
    } else if (symbol === 'TAIEX') {
      return '^TWII'
    }
    return symbol.startsWith('^') ? symbol : `^${symbol}`
  }
  return symbol
}

function getYahooInterval(timeframe: string): string {
  if (timeframe === '1D') return '1m'
  if (timeframe === '1W') return '5m'
  if (timeframe === '1M') return '1d'
  if (timeframe === '1Y') return '1d'
  return '1d'
}

function getYahooRange(timeframe: string): string {
  if (timeframe === '1D') return '1d'
  if (timeframe === '1W') return '5d'
  if (timeframe === '1M') return '1mo'
  if (timeframe === '1Y') return '1y'
  return '1mo'
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get('symbol')
    const exchange = searchParams.get('exchange')
    const timeframe = searchParams.get('timeframe') || '1D'

    if (!symbol || !exchange) {
      return NextResponse.json({ error: 'Missing symbol or exchange' }, { status: 400 })
    }

    const yahooSymbol = getYahooSymbol(symbol, exchange)
    const interval = getYahooInterval(timeframe)
    const range = getYahooRange(timeframe)
    
    try {
      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=${interval}&range=${range}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          },
          next: { revalidate: 300 },
          signal: AbortSignal.timeout(10000)
        }
      )
      
      if (response.ok) {
        const data = await response.json()
        if (data.chart?.result && data.chart.result.length > 0) {
          const result = data.chart.result[0]
          const timestamps = result.timestamp || []
          const quote = result.indicators?.quote?.[0]
          const adjclose = result.indicators?.adjclose?.[0]?.adjclose || []
          
          if (quote && timestamps.length > 0) {
            const opens = quote.open || []
            const highs = quote.high || []
            const lows = quote.low || []
            const closes = quote.close || []
            
            const volumes = quote.volume || []
            const dataPoints: Array<{ time: string; value: number; open?: number; high?: number; low?: number; close?: number; volume?: number }> = []
            
            for (let i = 0; i < timestamps.length; i++) {
              const timestamp = timestamps[i]
              const open = opens[i]
              const high = highs[i]
              const low = lows[i]
              const close = closes[i] || adjclose[i]
              const volume = volumes[i] || 0
              
              if (close && close > 0) {
                const date = new Date(timestamp * 1000)
                const timeStr = timeframe === '1D' 
                  ? date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
                  : date.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })
                
                dataPoints.push({
                  time: timeStr,
                  value: close,
                  open: open || close,
                  high: high || close,
                  low: low || close,
                  close: close,
                  volume: volume
                })
              }
            }
            
            if (dataPoints.length > 0) {
              return NextResponse.json({ data: dataPoints })
            }
          }
        }
      }
    } catch (error) {
      console.error('Yahoo Finance chart API error:', error)
    }

    return NextResponse.json({ data: [] })
  } catch (error) {
    console.error('Stock chart API error:', error)
    return NextResponse.json({ error: 'Failed to fetch chart data' }, { status: 500 })
  }
}

