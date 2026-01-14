import { NextResponse } from 'next/server'

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get('symbol')
    const exchange = searchParams.get('exchange')

    if (!symbol || !exchange) {
      return NextResponse.json({ error: 'Missing symbol or exchange' }, { status: 400 })
    }

    if (exchange === 'TWSE' || exchange === 'FOREX' || exchange === 'CRYPTO' || exchange === 'INDEX') {
      const yahooSymbol = getYahooSymbol(symbol, exchange)
      
      try {
        const response = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=1d`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json',
            },
            next: { revalidate: 60 },
            signal: AbortSignal.timeout(8000)
          }
        )
        
        if (response.ok) {
          const data = await response.json()
          if (data.chart?.result && data.chart.result.length > 0) {
            const result = data.chart.result[0]
            const meta = result.meta
            const quote = result.indicators?.quote?.[0]
            
            if (meta && quote) {
              const currentPrice = meta.regularMarketPrice || meta.previousClose || 0
              const previousClose = meta.previousClose || currentPrice
              const change = currentPrice - previousClose
              const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0
              const high = meta.regularMarketDayHigh || meta.previousClose || 0
              const low = meta.regularMarketDayLow || meta.previousClose || 0
              const open = meta.regularMarketOpen || meta.previousClose || 0
              const volume = meta.regularMarketVolume || 0
              
              return NextResponse.json({
                symbol: symbol,
                name: meta.shortName || symbol,
                price: currentPrice,
                change,
                changePercent: parseFloat(changePercent.toFixed(2)),
                volume,
                high,
                low,
                open
              })
            }
          }
        }
      } catch (error) {
        console.error('Yahoo Finance API error:', error)
      }
    }

    return NextResponse.json({
      symbol,
      name: symbol,
      price: 0,
      change: 0,
      changePercent: 0,
      volume: 0,
      high: 0,
      low: 0,
      open: 0
    })
  } catch (error) {
    console.error('Stock price API error:', error)
    return NextResponse.json({ error: 'Failed to fetch stock price' }, { status: 500 })
  }
}

