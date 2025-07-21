#!/usr/bin/env node

/**
 * VPN 멀티레이어 기반 고속 크롤링 전략
 * 
 * VPN 구성:
 * - 1차: Wrap VPN
 * - 2차: NordVPN
 * - 효과: IP 로테이션 + 트래픽 분산으로 검출 방지
 * 
 * 성능 목표:
 * - 일일 300개 단지 (기존 75개의 4배)
 * - 완료 기간: 66일 (기존 265일의 1/4)
 * - 동시 워커 4개 운영
 */

const sqlite3 = require('sqlite3').verbose()
const fs = require('fs')
const path = require('path')

class AdvancedCrawlingStrategy {
  constructor() {
    this.integratedDbPath = '/Users/seongjunkim/projects/real-estate-platform/api/data/full_integrated_real_estate.db'
    this.outputDir = '/Users/seongjunkim/projects/real-estate-platform/api/data/advanced_crawling_plans'
    
    this.config = {
      // 고속 크롤링 설정
      daily_limit: 300,
      concurrent_workers: 4,
      batch_size: 75,
      
      // VPN 멀티레이어 설정
      vpn_config: {
        primary_vpn: 'wrap',
        secondary_vpn: 'nordvpn',
        ip_rotation_interval: 50,  // 50개 단지마다 IP 변경
        safety_delay: 3000,        // 요청간 3초 지연
        detection_threshold: 0.1,  // 검출 임계치 10%
        emergency_cooldown: 1800   // 비상 대기시간 30분
      },
      
      // 워커별 전략
      worker_strategies: [
        {
          id: 'worker_1',
          vpn_profile: 'wrap_seoul',
          target_regions: ['서울', '경기'],
          priority_range: [1, 2],
          daily_quota: 80
        },
        {
          id: 'worker_2', 
          vpn_profile: 'wrap_busan',
          target_regions: ['부산', '대구', '대전'],
          priority_range: [1, 3],
          daily_quota: 75
        },
        {
          id: 'worker_3',
          vpn_profile: 'nord_incheon',
          target_regions: ['인천', '광주', '울산'],
          priority_range: [2, 4],
          daily_quota: 70
        },
        {
          id: 'worker_4',
          vpn_profile: 'nord_mixed',
          target_regions: ['세종', '기타지역'],
          priority_range: [3, 6],
          daily_quota: 75
        }
      ],
      
      // 안전성 설정
      safety_measures: {
        max_requests_per_hour: 150,
        user_agent_rotation: true,
        random_delays: true,
        request_headers_variation: true,
        browser_fingerprint_masking: true
      }
    }
    
    this.stats = {
      total_complexes: 0,
      no_listing_complexes: 0,
      estimated_completion_days: 0,
      worker_assignments: {},
      vpn_load_distribution: {},
      risk_assessment: 'LOW'
    }
  }

  async run() {
    console.log('🚀 VPN 멀티레이어 기반 고속 크롤링 전략 수립')
    console.log('='.repeat(70))
    
    try {
      await this.connectDatabase()
      await this.analyzeComplexes()
      await this.createWorkerAssignments()
      await this.calculateVpnLoadDistribution()
      await this.generateAdvancedSchedule()
      await this.createSafetyProtocols()
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

  async analyzeComplexes() {
    console.log('📊 크롤링 대상 분석 중...')
    
    const query = `
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
    
    const complexes = await this.queryDatabase(query)
    this.stats.no_listing_complexes = complexes.length
    this.stats.estimated_completion_days = Math.ceil(complexes.length / this.config.daily_limit)
    this.complexes = complexes
    
    console.log(`📊 분석 완료: ${complexes.length}개 단지, 예상 ${this.stats.estimated_completion_days}일`)
  }

  async createWorkerAssignments() {
    console.log('👥 워커별 작업 할당 중...')
    
    const regionMapping = {
      '서울': ['강남구', '서초구', '송파구', '강동구', '노원구', '성북구', '영등포구', '구로구', '마포구', '양천구', '동작구', '강남구', '서대문구', '은평구', '도봉구', '중랑구', '관악구', '광진구', '용산구', '강북구', '금천구', '종로구'],
      '경기': ['수원', '성남', '안양', '부천', '광명', '평택', '동두천', '안산', '고양', '과천', '구리', '남양주', '오산', '시흥', '군포', '의왕', '하남', '용인', '파주', '이천', '안성', '김포', '화성', '광주', '양주', '포천', '여주', '연천', '가평', '양평'],
      '부산': ['북구', '서구', '남구', '동구', '해운대구', '부산진구', '사하구', '동래구', '연제구', '사상구', '금정구', '수영구', '영도구', '기장군'],
      '대구': ['달서구', '수성구', '달성군'],
      '대전': ['유성구', '대덕구'],
      '인천': ['연수구', '남동구', '부평구', '계양구', '미추홀구', '강화군'],
      '광주': ['광산구'],
      '울산': ['울주군'],
      '세종': ['세종'],
      '기타지역': []
    }
    
    // 지역별로 단지 분류
    const regionComplexes = {}
    for (const [region, districts] of Object.entries(regionMapping)) {
      regionComplexes[region] = this.complexes.filter(c => 
        districts.some(district => c.sigungu.includes(district)) ||
        (region === '기타지역' && !Object.values(regionMapping).flat().some(d => c.sigungu.includes(d)))
      )
    }
    
    // 워커별 할당
    for (const worker of this.config.worker_strategies) {
      const workerComplexes = []
      
      for (const region of worker.target_regions) {
        const regionCandidates = (regionComplexes[region] || []).filter(c => 
          c.crawling_priority >= worker.priority_range[0] && 
          c.crawling_priority <= worker.priority_range[1]
        )
        workerComplexes.push(...regionCandidates)
      }
      
      // 일일 할당량에 맞춰 정렬 및 분배
      const sortedComplexes = workerComplexes
        .sort((a, b) => b.total_transactions - a.total_transactions)
        .slice(0, worker.daily_quota * this.stats.estimated_completion_days)
      
      this.stats.worker_assignments[worker.id] = {
        total_assigned: sortedComplexes.length,
        daily_quota: worker.daily_quota,
        estimated_days: Math.ceil(sortedComplexes.length / worker.daily_quota),
        regions: worker.target_regions,
        vpn_profile: worker.vpn_profile,
        complexes: sortedComplexes
      }
    }
    
    console.log('👥 워커 할당 완료')
  }

  async calculateVpnLoadDistribution() {
    console.log('🌐 VPN 부하 분산 계산 중...')
    
    const wrapWorkers = this.config.worker_strategies.filter(w => w.vpn_profile.includes('wrap'))
    const nordWorkers = this.config.worker_strategies.filter(w => w.vpn_profile.includes('nord'))
    
    this.stats.vpn_load_distribution = {
      wrap: {
        workers: wrapWorkers.length,
        daily_requests: wrapWorkers.reduce((sum, w) => sum + w.daily_quota, 0),
        hourly_peak: Math.ceil(wrapWorkers.reduce((sum, w) => sum + w.daily_quota, 0) / 8), // 8시간 작업
        estimated_load: 'MEDIUM'
      },
      nordvpn: {
        workers: nordWorkers.length,
        daily_requests: nordWorkers.reduce((sum, w) => sum + w.daily_quota, 0),
        hourly_peak: Math.ceil(nordWorkers.reduce((sum, w) => sum + w.daily_quota, 0) / 8),
        estimated_load: 'MEDIUM'
      }
    }
    
    // 위험도 평가
    const totalHourlyRequests = this.stats.vpn_load_distribution.wrap.hourly_peak + 
                               this.stats.vpn_load_distribution.nordvpn.hourly_peak
    
    if (totalHourlyRequests > 200) {
      this.stats.risk_assessment = 'HIGH'
    } else if (totalHourlyRequests > 100) {
      this.stats.risk_assessment = 'MEDIUM'
    } else {
      this.stats.risk_assessment = 'LOW'
    }
    
    console.log('🌐 VPN 부하 분산 완료')
  }

  async generateAdvancedSchedule() {
    console.log('📅 고급 크롤링 스케줄 생성 중...')
    
    // 출력 디렉토리 생성
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true })
    }
    
    const schedule = {
      overview: {
        total_days: this.stats.estimated_completion_days,
        daily_target: this.config.daily_limit,
        completion_date: this.calculateCompletionDate(),
        risk_level: this.stats.risk_assessment
      },
      vpn_strategy: this.config.vpn_config,
      worker_assignments: this.stats.worker_assignments,
      safety_protocols: this.config.safety_measures,
      daily_schedule: this.generateDailyWorkerSchedule()
    }
    
    fs.writeFileSync(
      path.join(this.outputDir, 'advanced_crawling_schedule.json'),
      JSON.stringify(schedule, null, 2),
      'utf8'
    )
    
    console.log('📅 고급 스케줄 생성 완료')
  }

  generateDailyWorkerSchedule() {
    const dailySchedule = {}
    let currentDate = new Date()
    
    for (let day = 1; day <= this.stats.estimated_completion_days; day++) {
      const dateKey = currentDate.toISOString().split('T')[0]
      
      dailySchedule[dateKey] = {
        day: day,
        workers: {}
      }
      
      for (const [workerId, assignment] of Object.entries(this.stats.worker_assignments)) {
        const dayStartIndex = (day - 1) * assignment.daily_quota
        const dayEndIndex = day * assignment.daily_quota
        const todayComplexes = assignment.complexes.slice(dayStartIndex, dayEndIndex)
        
        dailySchedule[dateKey].workers[workerId] = {
          vpn_profile: assignment.vpn_profile,
          target_count: todayComplexes.length,
          regions: assignment.regions,
          start_time: this.calculateWorkerStartTime(workerId),
          estimated_duration: `${Math.ceil(todayComplexes.length / 12)} hours`, // 12개/시간 기준
          complexes: todayComplexes.slice(0, 10) // 상위 10개만 미리보기
        }
      }
      
      // 다음 날 (주말 제외)
      do {
        currentDate.setDate(currentDate.getDate() + 1)
      } while (currentDate.getDay() === 0 || currentDate.getDay() === 6)
    }
    
    return dailySchedule
  }

  calculateWorkerStartTime(workerId) {
    const startTimes = {
      'worker_1': '09:00',
      'worker_2': '10:00',
      'worker_3': '11:00',
      'worker_4': '12:00'
    }
    return startTimes[workerId] || '09:00'
  }

  calculateCompletionDate() {
    let date = new Date()
    let workdays = 0
    
    while (workdays < this.stats.estimated_completion_days) {
      date.setDate(date.getDate() + 1)
      if (date.getDay() !== 0 && date.getDay() !== 6) { // 주말 제외
        workdays++
      }
    }
    
    return date.toISOString().split('T')[0]
  }

  async createSafetyProtocols() {
    console.log('🛡️ 안전 프로토콜 생성 중...')
    
    const protocols = {
      detection_prevention: {
        ip_rotation: {
          interval: this.config.vpn_config.ip_rotation_interval,
          method: 'automatic',
          fallback_vpn: 'secondary'
        },
        request_patterns: {
          random_delays: [2000, 3000, 4000, 5000],
          user_agents: [
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
          ],
          headers_variation: true
        },
        rate_limiting: {
          max_concurrent: this.config.concurrent_workers,
          requests_per_minute: 25,
          burst_protection: true
        }
      },
      emergency_procedures: {
        detection_response: {
          immediate_stop: true,
          vpn_switch: true,
          cooldown_period: '30 minutes',
          retry_strategy: 'exponential_backoff'
        },
        monitoring: {
          success_rate_threshold: 0.9,
          error_rate_alert: 0.1,
          performance_tracking: true
        }
      }
    }
    
    fs.writeFileSync(
      path.join(this.outputDir, 'safety_protocols.json'),
      JSON.stringify(protocols, null, 2),
      'utf8'
    )
    
    console.log('🛡️ 안전 프로토콜 완료')
  }

  async generateReports() {
    console.log('📄 리포트 생성 중...')
    
    // 성능 비교 리포트
    const comparison = {
      기존방식: {
        일일목표: 75,
        예상기간: '265일',
        완료예정: '2026-07-23',
        위험도: 'LOW'
      },
      고속방식: {
        일일목표: 300,
        예상기간: `${this.stats.estimated_completion_days}일`,
        완료예정: this.calculateCompletionDate(),
        위험도: this.stats.risk_assessment
      },
      개선효과: {
        속도향상: '4배',
        기간단축: `${Math.round((265 - this.stats.estimated_completion_days) / 265 * 100)}%`,
        효율성: 'VPN 멀티레이어 + 병렬처리'
      }
    }
    
    fs.writeFileSync(
      path.join(this.outputDir, 'performance_comparison.json'),
      JSON.stringify(comparison, null, 2),
      'utf8'
    )
    
    // 실행 가이드
    const guide = [
      'VPN 멀티레이어 크롤링 실행 가이드',
      '=====================================',
      '',
      '1. VPN 설정 확인:',
      '   - Wrap VPN 연결 상태 확인',
      '   - NordVPN 백그라운드 준비',
      '   - IP 로테이션 스크립트 테스트',
      '',
      '2. 워커 실행 순서:',
      '   - Worker 1 (09:00): 서울/경기 고우선순위',
      '   - Worker 2 (10:00): 부산/대구/대전',
      '   - Worker 3 (11:00): 인천/광주/울산',
      '   - Worker 4 (12:00): 세종/기타지역',
      '',
      '3. 모니터링 항목:',
      '   - 성공률 90% 이상 유지',
      '   - 에러율 10% 이하 유지',
      '   - VPN 부하 분산 확인',
      '',
      '4. 비상 대응:',
      '   - 검출 감지시 즉시 중단',
      '   - VPN 전환 후 30분 대기',
      '   - 재시작시 다른 프로필 사용',
      ''
    ]
    
    fs.writeFileSync(
      path.join(this.outputDir, 'execution_guide.txt'),
      guide.join('\n'),
      'utf8'
    )
    
    console.log('📄 리포트 생성 완료')
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
    console.log('\n🚀 VPN 멀티레이어 고속 크롤링 전략 완료!')
    console.log('='.repeat(70))
    
    console.log(`⚡ 성능 향상:`)
    console.log(`   • 기존: 75개/일 → 새로운: 300개/일 (4배 향상)`)
    console.log(`   • 기존: 265일 → 새로운: ${this.stats.estimated_completion_days}일 (${Math.round((265 - this.stats.estimated_completion_days) / 265 * 100)}% 단축)`)
    console.log(`   • 완료 예정: ${this.calculateCompletionDate()}`)
    
    console.log(`\n🌐 VPN 부하 분산:`)
    console.log(`   • Wrap VPN: ${this.stats.vpn_load_distribution.wrap.workers}개 워커, ${this.stats.vpn_load_distribution.wrap.daily_requests}개/일`)
    console.log(`   • NordVPN: ${this.stats.vpn_load_distribution.nordvpn.workers}개 워커, ${this.stats.vpn_load_distribution.nordvpn.daily_requests}개/일`)
    console.log(`   • 위험도: ${this.stats.risk_assessment}`)
    
    console.log(`\n👥 워커 배치:`)
    Object.entries(this.stats.worker_assignments).forEach(([workerId, assignment]) => {
      console.log(`   • ${workerId}: ${assignment.total_assigned}개 단지 (${assignment.regions.join(', ')})`)
    })
    
    console.log(`\n📄 생성된 파일:`)
    console.log(`   • ${this.outputDir}/advanced_crawling_schedule.json`)
    console.log(`   • ${this.outputDir}/safety_protocols.json`)
    console.log(`   • ${this.outputDir}/performance_comparison.json`)
    console.log(`   • ${this.outputDir}/execution_guide.txt`)
    
    console.log(`\n🎯 다음 단계:`)
    console.log(`   1. VPN 연결 상태 확인`)
    console.log(`   2. 워커별 크롤링 스크립트 실행`)
    console.log(`   3. 실시간 모니터링 및 조정`)
  }
}

// 실행
if (require.main === module) {
  const strategy = new AdvancedCrawlingStrategy()
  strategy.run().catch(console.error)
}

module.exports = AdvancedCrawlingStrategy