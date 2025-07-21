#!/usr/bin/env node

/**
 * 매물 없는 19,868개 단지에 대한 네이버 크롤링 우선순위 계획 수립
 * 
 * 크롤링 전략:
 * 1. 거래량 기반 우선순위 (높은 거래량 = 높은 우선순위)
 * 2. 지역별 균형 고려 (서울, 경기 등 주요 지역 우선)
 * 3. 일일 크롤링 목표량 설정 (50-100개 단지/일)
 * 4. 크롤링 스케줄링 및 진행률 추적
 */

const sqlite3 = require('sqlite3').verbose()
const fs = require('fs')
const path = require('path')

class PriorityCrawlingPlanner {
  constructor() {
    this.integratedDbPath = '/Users/seongjunkim/projects/real-estate-platform/api/data/full_integrated_real_estate.db'
    this.outputDir = '/Users/seongjunkim/projects/real-estate-platform/api/data/crawling_plans'
    
    this.stats = {
      total_complexes: 0,
      no_listing_complexes: 0,
      priority_levels: {
        1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0
      },
      regions: {},
      daily_targets: {},
      estimated_days: 0
    }
    
    // 크롤링 설정
    this.config = {
      daily_limit: 300,         // 일일 크롤링 목표 (VPN 멀티레이어 활용)
      concurrent_workers: 4,    // 동시 실행 워커 수 (Wrap + Nord VPN)
      batch_size: 75,          // 워커당 배치 크기
      delay_between_requests: 2000, // 요청간 지연 (2초)
      priority_weights: {
        transaction_count: 0.5,  // 거래량 가중치
        region_priority: 0.3,    // 지역 우선순위 가중치
        recent_activity: 0.2     // 최근 활동 가중치
      },
      vpn_strategy: {
        primary: 'wrap',         // 1차 VPN
        secondary: 'nordvpn',    // 2차 VPN
        rotation_interval: 50,   // 50개마다 IP 로테이션
        safety_margin: 0.8       // 안전 마진 (검출 방지)
      },
      region_priorities: {
        '서울특별시': 1.0,
        '경기도': 0.9,
        '인천광역시': 0.8,
        '부산광역시': 0.7,
        '대구광역시': 0.6,
        '대전광역시': 0.6,
        '광주광역시': 0.6,
        '울산광역시': 0.6,
        '세종특별자치시': 0.5
      }
    }
  }

  async run() {
    console.log('📋 네이버 크롤링 우선순위 계획 수립 시작')
    console.log('='.repeat(60))
    
    try {
      await this.connectDatabase()
      await this.analyzeCurrentState()
      await this.calculatePriorities()
      await this.createCrawlingSchedule()
      await this.generateReports()
      this.printResults()
      
    } catch (error) {
      console.error('❌ 오류 발생:', error)
    } finally {
      await this.closeDatabase()
    }
  }

  async connectDatabase() {
    console.log('📡 데이터베이스 연결 중...')
    
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.integratedDbPath, (err) => {
        if (err) {
          reject(new Error(`DB 연결 실패: ${err.message}`))
          return
        }
        console.log('✅ 데이터베이스 연결 완료')
        resolve()
      })
    })
  }

  async analyzeCurrentState() {
    console.log('📊 현재 상태 분석 중...')
    
    // 전체 단지 수 조회
    const totalQuery = `SELECT COUNT(*) as total FROM apartment_complexes`
    const totalResult = await this.queryDatabase(totalQuery)
    this.stats.total_complexes = totalResult[0].total
    
    // 매물 없는 단지 조회
    const noListingQuery = `
      SELECT 
        ac.id,
        ac.apartment_name,
        ac.sigungu,
        ac.eup_myeon_dong,
        ac.total_transactions,
        ac.crawling_priority,
        ac.latest_transaction_date,
        COALESCE(listing_count.count, 0) as current_listings
      FROM apartment_complexes ac
      LEFT JOIN (
        SELECT complex_id, COUNT(*) as count 
        FROM current_listings 
        GROUP BY complex_id
      ) listing_count ON ac.id = listing_count.complex_id
      WHERE COALESCE(listing_count.count, 0) = 0
      ORDER BY ac.total_transactions DESC, ac.crawling_priority ASC
    `
    
    const noListingComplexes = await this.queryDatabase(noListingQuery)
    this.stats.no_listing_complexes = noListingComplexes.length
    
    // 지역별 통계
    for (const complex of noListingComplexes) {
      const region = complex.sigungu
      if (!this.stats.regions[region]) {
        this.stats.regions[region] = {
          count: 0,
          total_transactions: 0,
          complexes: []
        }
      }
      this.stats.regions[region].count++
      this.stats.regions[region].total_transactions += complex.total_transactions
      this.stats.regions[region].complexes.push(complex)
    }
    
    // 우선순위별 통계
    for (const complex of noListingComplexes) {
      const priority = complex.crawling_priority || 6
      this.stats.priority_levels[priority]++
    }
    
    this.noListingComplexes = noListingComplexes
    console.log(`📊 분석 완료: 매물 없는 단지 ${this.stats.no_listing_complexes}개`)
  }

  async calculatePriorities() {
    console.log('🎯 크롤링 우선순위 재계산 중...')
    
    for (const complex of this.noListingComplexes) {
      // 거래량 점수 (0-100)
      const maxTransactions = Math.max(...this.noListingComplexes.map(c => c.total_transactions))
      const transactionScore = maxTransactions > 0 ? 
        (complex.total_transactions / maxTransactions) * 100 : 0
      
      // 지역 점수 (0-100)
      const regionPriority = this.getRegionPriority(complex.sigungu)
      const regionScore = regionPriority * 100
      
      // 최근 활동 점수 (0-100)
      const recentScore = this.calculateRecentActivityScore(complex.latest_transaction_date)
      
      // 최종 우선순위 점수 계산
      const finalScore = 
        (transactionScore * this.config.priority_weights.transaction_count) +
        (regionScore * this.config.priority_weights.region_priority) +
        (recentScore * this.config.priority_weights.recent_activity)
      
      complex.final_priority_score = Math.round(finalScore * 100) / 100
      
      // 우선순위 레벨 재분류 (1-6)
      if (finalScore >= 80) complex.new_priority = 1
      else if (finalScore >= 60) complex.new_priority = 2
      else if (finalScore >= 40) complex.new_priority = 3
      else if (finalScore >= 25) complex.new_priority = 4
      else if (finalScore >= 10) complex.new_priority = 5
      else complex.new_priority = 6
    }
    
    // 점수순으로 정렬
    this.noListingComplexes.sort((a, b) => b.final_priority_score - a.final_priority_score)
    
    console.log('✅ 우선순위 재계산 완료')
  }

  getRegionPriority(sigungu) {
    // 광역시/도 추출
    const region = sigungu.includes('시') ? 
      sigungu.split(' ')[0] + (sigungu.includes('특별시') ? '특별시' : 
                             sigungu.includes('광역시') ? '광역시' : '시') :
      sigungu.includes('도') ? sigungu.split(' ')[0] + '도' : sigungu
    
    return this.config.region_priorities[region] || 0.4
  }

  calculateRecentActivityScore(latestDate) {
    if (!latestDate) return 0
    
    const today = new Date()
    const transactionDate = new Date(latestDate + '-01') // YYYY-MM 형태
    const monthsDiff = (today.getFullYear() - transactionDate.getFullYear()) * 12 + 
                      (today.getMonth() - transactionDate.getMonth())
    
    // 최근 6개월 = 100점, 1년 = 70점, 2년 = 40점, 3년+ = 10점
    if (monthsDiff <= 6) return 100
    if (monthsDiff <= 12) return 70
    if (monthsDiff <= 24) return 40
    return 10
  }

  async createCrawlingSchedule() {
    console.log('📅 크롤링 스케줄 생성 중...')
    
    const totalDays = Math.ceil(this.stats.no_listing_complexes / this.config.daily_limit)
    this.stats.estimated_days = totalDays
    
    let currentDate = new Date()
    let dayIndex = 0
    
    for (let i = 0; i < this.noListingComplexes.length; i += this.config.daily_limit) {
      const batch = this.noListingComplexes.slice(i, i + this.config.daily_limit)
      const dateKey = currentDate.toISOString().split('T')[0] // YYYY-MM-DD
      
      this.stats.daily_targets[dateKey] = {
        day: dayIndex + 1,
        target_count: batch.length,
        complexes: batch.map(c => ({
          id: c.id,
          name: c.apartment_name,
          location: `${c.sigungu} ${c.eup_myeon_dong}`,
          priority: c.new_priority,
          score: c.final_priority_score,
          transactions: c.total_transactions
        }))
      }
      
      // 다음 날 (주말 제외)
      do {
        currentDate.setDate(currentDate.getDate() + 1)
      } while (currentDate.getDay() === 0 || currentDate.getDay() === 6) // 일요일(0), 토요일(6) 제외
      
      dayIndex++
    }
    
    console.log(`📅 스케줄 생성 완료: ${totalDays}일 계획`)
  }

  async generateReports() {
    console.log('📄 리포트 생성 중...')
    
    // 출력 디렉토리 생성
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true })
    }
    
    // 1. 전체 우선순위 리스트
    await this.generatePriorityReport()
    
    // 2. 일일 크롤링 스케줄
    await this.generateDailySchedule()
    
    // 3. 지역별 분석 리포트
    await this.generateRegionalReport()
    
    // 4. 크롤링 설정 파일
    await this.generateConfigFile()
    
    console.log(`📄 리포트 생성 완료: ${this.outputDir}`)
  }

  async generatePriorityReport() {
    const report = [
      '크롤링 우선순위 리스트',
      '====================',
      `생성일시: ${new Date().toLocaleString('ko-KR')}`,
      `총 대상 단지: ${this.stats.no_listing_complexes}개`,
      '',
      '순위\t점수\t우선순위\t거래량\t단지명\t위치',
      '-'.repeat(80)
    ]
    
    this.noListingComplexes.forEach((complex, index) => {
      report.push(
        `${(index + 1).toString().padStart(4)}\t` +
        `${complex.final_priority_score.toFixed(1)}\t` +
        `${complex.new_priority}\t` +
        `${complex.total_transactions.toString().padStart(4)}\t` +
        `${complex.apartment_name}\t` +
        `${complex.sigungu} ${complex.eup_myeon_dong}`
      )
    })
    
    fs.writeFileSync(
      path.join(this.outputDir, 'priority_list.txt'),
      report.join('\n'),
      'utf8'
    )
  }

  async generateDailySchedule() {
    const scheduleData = {
      total_days: this.stats.estimated_days,
      daily_limit: this.config.daily_limit,
      start_date: Object.keys(this.stats.daily_targets)[0],
      end_date: Object.keys(this.stats.daily_targets).slice(-1)[0],
      schedule: this.stats.daily_targets
    }
    
    fs.writeFileSync(
      path.join(this.outputDir, 'daily_schedule.json'),
      JSON.stringify(scheduleData, null, 2),
      'utf8'
    )
    
    // 사람이 읽기 쉬운 스케줄 파일도 생성
    const readableSchedule = [
      '일일 크롤링 스케줄',
      '==================',
      `총 기간: ${this.stats.estimated_days}일`,
      `일일 목표: ${this.config.daily_limit}개 단지`,
      ''
    ]
    
    Object.entries(this.stats.daily_targets).forEach(([date, data]) => {
      readableSchedule.push(`[${data.day}일차] ${date} - ${data.target_count}개 단지`)
      readableSchedule.push('  우선순위 1-2급: ' + 
        data.complexes.filter(c => c.priority <= 2).length + '개')
      readableSchedule.push('  우선순위 3-4급: ' + 
        data.complexes.filter(c => c.priority >= 3 && c.priority <= 4).length + '개')
      readableSchedule.push('  우선순위 5-6급: ' + 
        data.complexes.filter(c => c.priority >= 5).length + '개')
      readableSchedule.push('')
    })
    
    fs.writeFileSync(
      path.join(this.outputDir, 'daily_schedule.txt'),
      readableSchedule.join('\n'),
      'utf8'
    )
  }

  async generateRegionalReport() {
    const report = [
      '지역별 크롤링 분석',
      '==================',
      '지역\t단지수\t총거래량\t평균거래량\t비중',
      '-'.repeat(60)
    ]
    
    const sortedRegions = Object.entries(this.stats.regions)
      .sort(([,a], [,b]) => b.total_transactions - a.total_transactions)
    
    for (const [region, data] of sortedRegions) {
      const avgTransactions = Math.round(data.total_transactions / data.count)
      const percentage = ((data.count / this.stats.no_listing_complexes) * 100).toFixed(1)
      
      report.push(
        `${region}\t${data.count}\t${data.total_transactions}\t${avgTransactions}\t${percentage}%`
      )
    }
    
    fs.writeFileSync(
      path.join(this.outputDir, 'regional_analysis.txt'),
      report.join('\n'),
      'utf8'
    )
  }

  async generateConfigFile() {
    const config = {
      crawling_settings: this.config,
      statistics: this.stats,
      generated_at: new Date().toISOString(),
      next_update_recommended: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    }
    
    fs.writeFileSync(
      path.join(this.outputDir, 'crawling_config.json'),
      JSON.stringify(config, null, 2),
      'utf8'
    )
  }

  async queryDatabase(query) {
    return new Promise((resolve, reject) => {
      this.db.all(query, [], (err, rows) => {
        if (err) {
          reject(err)
          return
        }
        resolve(rows)
      })
    })
  }

  async closeDatabase() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close(resolve)
      } else {
        resolve()
      }
    })
  }

  printResults() {
    console.log('\n🎉 크롤링 계획 수립 완료!')
    console.log('='.repeat(60))
    console.log(`📊 분석 결과:`)
    console.log(`   • 전체 단지: ${this.stats.total_complexes.toLocaleString()}개`)
    console.log(`   • 매물 없는 단지: ${this.stats.no_listing_complexes.toLocaleString()}개`)
    console.log(`   • 크롤링 필요 비율: ${((this.stats.no_listing_complexes/this.stats.total_complexes)*100).toFixed(1)}%`)
    
    console.log(`\n📅 크롤링 계획:`)
    console.log(`   • 일일 목표: ${this.config.daily_limit}개 단지`)
    console.log(`   • 예상 소요일: ${this.stats.estimated_days}일 (평일 기준)`)
    console.log(`   • 예상 완료일: ${Object.keys(this.stats.daily_targets).slice(-1)[0]}`)
    
    console.log(`\n🎯 우선순위 분포:`)
    for (let i = 1; i <= 6; i++) {
      const count = this.stats.priority_levels[i] || 0
      const percentage = ((count / this.stats.no_listing_complexes) * 100).toFixed(1)
      console.log(`   • ${i}급 (${i <= 2 ? '높음' : i <= 4 ? '중간' : '낮음'}): ${count}개 (${percentage}%)`)
    }
    
    console.log(`\n📄 생성된 파일:`)
    console.log(`   • ${this.outputDir}/priority_list.txt`)
    console.log(`   • ${this.outputDir}/daily_schedule.json`)
    console.log(`   • ${this.outputDir}/daily_schedule.txt`)
    console.log(`   • ${this.outputDir}/regional_analysis.txt`)
    console.log(`   • ${this.outputDir}/crawling_config.json`)
    
    console.log(`\n🚀 다음 단계:`)
    console.log(`   1. 생성된 스케줄에 따라 일일 크롤링 실행`)
    console.log(`   2. 우선순위 1-2급 단지부터 시작`)
    console.log(`   3. 진행률 모니터링 및 조정`)
  }
}

// 실행
if (require.main === module) {
  const planner = new PriorityCrawlingPlanner()
  planner.run().catch(console.error)
}

module.exports = PriorityCrawlingPlanner