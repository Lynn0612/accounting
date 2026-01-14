import { NextResponse } from 'next/server'
import { parseStringPromise } from 'xml2js'

interface NewsItem {
  title: string
  link: string
  pubDate: string
  source: string
  image?: string
}

const RSS_FEEDS = [
  'https://tw.news.yahoo.com/rss/finance',
  'https://feeds.finance.yahoo.com/rss/2.0/headline?s=^TWII&region=TW&lang=zh-TW'
]

function extractFirstImage(description: string): string | undefined {
  if (!description) return undefined
  
  const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (imgMatch && imgMatch[1]) {
    let imgUrl = imgMatch[1]
    if (imgUrl.startsWith('//')) {
      imgUrl = 'https:' + imgUrl
    } else if (imgUrl.startsWith('/')) {
      imgUrl = 'https://s.yimg.com' + imgUrl
    }
    return imgUrl
  }
  
  const imgMatch2 = description.match(/src=["']([^"']+)["']/i)
  if (imgMatch2 && imgMatch2[1]) {
    let imgUrl = imgMatch2[1]
    if (imgUrl.startsWith('//')) {
      imgUrl = 'https:' + imgUrl
    } else if (imgUrl.startsWith('/')) {
      imgUrl = 'https://s.yimg.com' + imgUrl
    }
    return imgUrl
  }
  
  return undefined
}

export async function GET(request: Request) {
  try {
    const feeds = RSS_FEEDS
    const allNews: NewsItem[] = []

    const feedPromises = feeds.map(async (feedUrl) => {
      try {
        const response = await fetch(feedUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          next: { revalidate: 300 },
          signal: AbortSignal.timeout(10000)
        })

        if (!response.ok) return []

        const xml = await response.text()
        
        try {
          const result = await parseStringPromise(xml)
          const items = result?.rss?.channel?.[0]?.item || []
          const channel = result?.rss?.channel?.[0]
          const source = channel?.title?.[0] || 'Yahoo Finance'

          return items.map((item: any, index: number) => {
            const title = item.title?.[0] || ''
            const link = item.link?.[0] || ''
            
            let pubDate = ''
            
            const pubDateFields = [
              item.pubDate,
              item['dc:date'],
              item.published,
              item['atom:published'],
              item['atom:updated']
            ]
            
            for (const field of pubDateFields) {
              if (Array.isArray(field) && field[0]) {
                pubDate = String(field[0]).trim()
                break
              } else if (field && typeof field === 'string') {
                pubDate = field.trim()
                break
              }
            }
            
            if (pubDate) {
              try {
                const parsedDate = new Date(pubDate)
                if (isNaN(parsedDate.getTime())) {
                  pubDate = ''
                } else {
                  pubDate = parsedDate.toISOString()
                }
              } catch (e) {
                pubDate = ''
              }
            }
            
            if (!pubDate) {
              const fallbackDate = new Date()
              fallbackDate.setMinutes(fallbackDate.getMinutes() - index)
              pubDate = fallbackDate.toISOString()
            }
            
            const description = item.description?.[0] || item['content:encoded']?.[0] || ''
            
            let image: string | undefined
            
            if (item['media:content']) {
              image = item['media:content'][0]?.$?.url
            } else if (item['media:thumbnail']) {
              image = item['media:thumbnail'][0]?.$?.url
            } else if (item.enclosure && item.enclosure[0]?.$?.type?.startsWith('image/')) {
              image = item.enclosure[0]?.$?.url
            } else {
              image = extractFirstImage(description)
            }
            
            if (image) {
              if (image.startsWith('//')) {
                image = 'https:' + image
              } else if (image.startsWith('/')) {
                if (feedUrl.includes('cnyes.com')) {
                  image = 'https://news.cnyes.com' + image
                } else {
                  image = 'https://s.yimg.com' + image
                }
              }
            }

            const cleanSource = source
              .replace(' - Yahoo Finance', '')
              .replace(' - Yahoo財經', '')
              .trim()

            return {
              title,
              link,
              pubDate,
              source: cleanSource || 'Yahoo財經',
              image
            }
          })
        } catch (parseError) {
          console.error('Error parsing XML:', parseError)
          return []
        }
      } catch (error) {
        console.error(`Error fetching feed ${feedUrl}:`, error)
        return []
      }
    })

    const results = await Promise.allSettled(feedPromises)
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        allNews.push(...result.value)
      }
    })

    allNews.sort((a, b) => {
      return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
    })

    return NextResponse.json({ items: allNews.slice(0, 20) })
  } catch (error) {
    console.error('Error in news API:', error)
    
    const mockNews: NewsItem[] = [
      {
        title: 'Tech stocks rally as inflation cools down globally',
        link: '#',
        pubDate: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        source: 'Yahoo',
        image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400'
      },
      {
        title: 'Bitcoin touches new resistance levels amidst market volatility',
        link: '#',
        pubDate: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        source: 'CoinDesk',
        image: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400'
      },
      {
        title: 'Start saving smartly: Top 5 tips for young investors',
        link: '#',
        pubDate: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        source: 'Blog',
        image: 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=400'
      },
      {
        title: 'Yen strengthens against the Dollar in early trading session',
        link: '#',
        pubDate: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
        source: 'Reuters',
        image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400'
      }
    ]

    return NextResponse.json({ items: mockNews })
  }
}

