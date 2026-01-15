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

    const feedPromises = feeds.map(async (feedUrl, feedIndex: number) => {
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

          return items.map((item: any, localIndex: number) => {
            // Use feedIndex and localIndex to create a unique index for fallback dates
            // This ensures each item from different feeds has a different time
            const index = feedIndex * 100 + localIndex
            const title = item.title?.[0] || ''
            const link = item.link?.[0] || ''
            
            let pubDate = ''
            let originalDateStr = ''
            
            const pubDateFields = [
              item.pubDate,
              item['dc:date'],
              item.published,
              item['atom:published'],
              item['atom:updated']
            ]
            
            for (const field of pubDateFields) {
              if (Array.isArray(field) && field[0]) {
                originalDateStr = String(field[0]).trim()
                pubDate = originalDateStr
                break
              } else if (field && typeof field === 'string') {
                originalDateStr = field.trim()
                pubDate = originalDateStr
                break
              }
            }
            
            if (pubDate) {
              try {
                // Clean up the date string first
                let cleanedDateStr = pubDate.trim()
                
                // Log original date string for debugging (first 3 items only)
                if (index < 3) {
                  console.log('Parsing date for item', index, ':', cleanedDateStr, 'from feed:', feedUrl)
                }
                
                // JavaScript's Date constructor can parse RFC 2822 format directly
                // Format: "Mon, 01 Jan 2024 12:00:00 +0800" or "Mon, 01 Jan 2024 12:00:00 GMT"
                let parsedDate = new Date(cleanedDateStr)
                
                // If parsing fails, try to fix common issues
                if (isNaN(parsedDate.getTime())) {
                  // Try removing timezone and adding it back
                  // Some RSS feeds have malformed timezone strings
                  const withoutTz = cleanedDateStr.replace(/\s*[+-]\d{4}$/, '').replace(/\s*GMT$/, '')
                  parsedDate = new Date(withoutTz + ' GMT')
                }
                
                // If still invalid, try ISO 8601 format
                if (isNaN(parsedDate.getTime())) {
                  // Try ISO format: "2024-01-01T12:00:00+08:00" or "2024-01-01T12:00:00Z"
                  parsedDate = new Date(cleanedDateStr.replace(/(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2}:\d{2})/, '$1T$2'))
                }
                
                if (isNaN(parsedDate.getTime())) {
                  // Log the original date string for debugging
                  console.warn('Could not parse date:', cleanedDateStr, 'from feed:', feedUrl)
                  pubDate = ''
                } else {
                  // Check if the parsed date is too old (more than 7 days) or in the future
                  // This might indicate a parsing error
                  const now = new Date()
                  const daysDiff = Math.abs((now.getTime() - parsedDate.getTime()) / (1000 * 60 * 60 * 24))
                  
                  // If the date is more than 7 days old or in the future by more than 1 day, it might be wrong
                  if (daysDiff > 7 || (parsedDate.getTime() > now.getTime() && daysDiff > 1)) {
                    console.warn('Suspicious date parsed:', cleanedDateStr, '->', parsedDate.toISOString(), 'days diff:', daysDiff)
                    // Don't reject it, but log it for debugging
                  }
                  
                  // Convert to ISO string
                  // The Date object already handles timezone conversion correctly
                  pubDate = parsedDate.toISOString()
                  
                  // Log successful parsing for first 3 items
                  if (index < 3) {
                    console.log('Successfully parsed date for item', index, ':', cleanedDateStr, '->', pubDate)
                  }
                }
              } catch (e) {
                console.error('Error parsing date:', pubDate, e)
                pubDate = ''
              }
            }
            
            if (!pubDate) {
              // Use a more realistic fallback: subtract hours and minutes
              // Make sure each item has a different time to avoid all showing the same time
              const fallbackDate = new Date()
              // Subtract hours based on index, and add some minutes variation
              // Use a more varied pattern to ensure each item is different
              const hoursAgo = Math.min(index + 1, 24) // Cap at 24 hours
              const minutesAgo = (index * 13) % 60 // Use prime number for better distribution
              fallbackDate.setHours(fallbackDate.getHours() - hoursAgo)
              fallbackDate.setMinutes(fallbackDate.getMinutes() - minutesAgo)
              fallbackDate.setSeconds(0) // Reset seconds for consistency
              pubDate = fallbackDate.toISOString()
              // Always log fallback usage to help debug
              console.log('Using fallback date for item', index, ':', pubDate, 'Hours ago:', hoursAgo, 'Minutes ago:', minutesAgo, 'Original was:', originalDateStr || 'empty')
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

    // 添加積極的響應緩存標頭
    // s-maxage: CDN 緩存時間（5分鐘）
    // stale-while-revalidate: 允許在重新驗證時使用過期緩存（10分鐘）
    // 這樣即使緩存過期，用戶仍能看到內容，同時在背景更新
    return NextResponse.json(
      { items: allNews.slice(0, 20) },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
          'CDN-Cache-Control': 'public, s-maxage=300',
          'Vercel-CDN-Cache-Control': 'public, s-maxage=300',
        }
      }
    )
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

