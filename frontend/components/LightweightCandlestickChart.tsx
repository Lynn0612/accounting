'use client'

import { useEffect, useRef } from 'react'
import { createChart, ColorType, CandlestickSeries, LineSeries, HistogramSeries, IChartApi, ISeriesApi } from 'lightweight-charts'

interface CandlestickData {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

interface LightweightCandlestickChartProps {
  data: CandlestickData[]
}

export default function LightweightCandlestickChart({ data }: LightweightCandlestickChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const maSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)

  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return

    if (!chartRef.current) {
      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#6b7280',
          fontSize: 11,
        },
        grid: {
          vertLines: {
            color: '#f3f4f6',
            style: 1,
            visible: true,
          },
          horzLines: {
            color: '#f3f4f6',
            style: 1,
            visible: true,
          },
        },
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight,
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
          borderColor: '#e5e7eb',
          rightOffset: 12,
          barSpacing: 6,
          fixLeftEdge: false,
          fixRightEdge: false,
        },
        rightPriceScale: {
          borderColor: '#e5e7eb',
          scaleMargins: {
            top: 0.15,
            bottom: 0.35,
          },
          entireTextOnly: false,
        },
        leftPriceScale: {
          visible: false,
        },
        crosshair: {
          mode: 1,
          vertLine: {
            color: '#9ca3af',
            width: 1,
            style: 2,
            labelBackgroundColor: '#ffffff',
          },
          horzLine: {
            color: '#9ca3af',
            width: 1,
            style: 2,
            labelBackgroundColor: '#ffffff',
          },
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
        },
        handleScale: {
          axisPressedMouseMove: true,
          mouseWheel: true,
          pinch: true,
        },
      })

      const candlestickSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#10b981',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#059669',
        wickDownColor: '#dc2626',
        priceFormat: {
          type: 'price',
          precision: 2,
          minMove: 0.01,
        },
      })

      const hasVolume = data.some(item => item.volume !== undefined && item.volume > 0)
      
      if (hasVolume) {
        chart.priceScale('left').applyOptions({
          visible: true,
          scaleMargins: {
            top: 0.7,
            bottom: 0.05,
          },
        })
        
        const volumeSeries = chart.addSeries(HistogramSeries, {
          color: '#94a3b8',
          priceFormat: {
            type: 'volume',
          },
          priceScaleId: 'left',
          scaleMargins: {
            top: 0.7,
            bottom: 0.05,
          },
        })
        volumeSeriesRef.current = volumeSeries
      }

      const closePrices = data.map(item => item.close).filter(price => price > 0)
      if (closePrices.length > 0) {
        const maPeriod = Math.min(20, Math.floor(closePrices.length / 2))
        if (maPeriod >= 5) {
          const maValues: number[] = []
          for (let i = 0; i < closePrices.length; i++) {
            if (i < maPeriod - 1) {
              maValues.push(closePrices[i])
            } else {
              const sum = closePrices.slice(i - maPeriod + 1, i + 1).reduce((a, b) => a + b, 0)
              maValues.push(sum / maPeriod)
            }
          }

          const maSeries = chart.addSeries(LineSeries, {
            color: '#3b82f6',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            priceFormat: {
              type: 'price',
              precision: 2,
              minMove: 0.01,
            },
          })
          maSeriesRef.current = maSeries
        }
      }

      chartRef.current = chart
      candlestickSeriesRef.current = candlestickSeries

      const handleResize = () => {
        if (chartRef.current && chartContainerRef.current) {
          chartRef.current.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
          })
        }
      }

      window.addEventListener('resize', handleResize)

      return () => {
        window.removeEventListener('resize', handleResize)
        if (chartRef.current) {
          chartRef.current.remove()
          chartRef.current = null
        }
      }
    }
  }, [data])

  useEffect(() => {
    if (!candlestickSeriesRef.current || data.length === 0) return

    const formattedData = data.map((item, index) => {
      let timestamp: any
      
      try {
        const date = new Date(item.time)
        if (isNaN(date.getTime())) {
          const parts = item.time.split(/[\/\-]/)
          if (parts.length >= 2) {
            const year = parts.length === 3 ? parseInt(parts[0]) : new Date().getFullYear()
            const month = parseInt(parts[parts.length === 3 ? 1 : 0]) - 1
            const day = parseInt(parts[parts.length === 3 ? 2 : 1])
            timestamp = new Date(year, month, day).getTime() / 1000
          } else {
            timestamp = (Date.now() / 1000) + index * 86400
          }
        } else {
          timestamp = date.getTime() / 1000
        }
      } catch {
        timestamp = (Date.now() / 1000) + index * 86400
      }
      
      return {
        time: timestamp,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
      }
    })

    candlestickSeriesRef.current.setData(formattedData)

    if (volumeSeriesRef.current) {
      const hasVolume = data.some(item => item.volume !== undefined && item.volume > 0)
      if (hasVolume) {
        const volumeData = formattedData.map((item, index) => ({
          time: item.time,
          value: data[index].volume || 0,
          color: data[index].close >= data[index].open ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
        }))
        volumeSeriesRef.current.setData(volumeData)
      }
    }

    if (maSeriesRef.current) {
      const closePrices = data.map(item => item.close).filter(price => price > 0)
      if (closePrices.length > 0) {
        const maPeriod = Math.min(20, Math.floor(closePrices.length / 2))
        if (maPeriod >= 5) {
          const maData = formattedData.map((item, index) => {
            if (index < maPeriod - 1) {
              return { time: item.time, value: closePrices[index] }
            } else {
              const sum = closePrices.slice(index - maPeriod + 1, index + 1).reduce((a, b) => a + b, 0)
              return { time: item.time, value: sum / maPeriod }
            }
          })
          maSeriesRef.current.setData(maData)
        }
      }
    }

    if (chartRef.current) {
      chartRef.current.timeScale().fitContent()
    }
  }, [data])

  return (
    <div ref={chartContainerRef} className="w-full h-full" />
  )
}

