#!/usr/bin/env node

/**
 * VPN 멀티레이어 고속 크롤링 실행기
 * 
 * 4개 워커로 동시 실행:
 * - Worker 1: 서울/경기 고우선순위 (Wrap VPN)
 * - Worker 2: 부산/대구/대전 (Wrap VPN)  
 * - Worker 3: 인천/광주/울산 (NordVPN)
 * - Worker 4: 세종/기타지역 (NordVPN)
 */

const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

class AdvancedCrawlingManager {
  constructor() {
    this.scheduleFile = '/Users/seongjunkim/projects/real-estate-platform/api/data/advanced_crawling_plans/advanced_crawling_schedule.json'
    this.logsDir = '/Users/seongjunkim/projects/real-estate-platform/api/logs/crawling'
    this.vpnLogsDir = '/Users/seongjunkim/projects/real-estate-platform/api/logs/vpn'
    
    this.workers = []
    this.stats = {
      total_processed: 0,
      success_count: 0,
      error_count: 0,
      start_time: null,
      current_day: 1
    }
    
    this.isRunning = false
  }

  async start() {
    console.log('🚀 VPN 멀티레이어 고속 크롤링 시작')
    console.log('=' .repeat(60))
    
    try {
      // 1. 스케줄 로드
      await this.loadSchedule()
      
      // 2. VPN 상태 확인
      await this.checkVpnStatus()
      
      // 3. 워커 시작
      await this.startWorkers()
      
      // 4. 모니터링 시작
      this.startMonitoring()
      
    } catch (error) {
      console.error('❌ 크롤링 시작 실패:', error)
      process.exit(1)
    }
  }

  async loadSchedule() {
    console.log('📋 크롤링 스케줄 로드 중...')
    
    if (!fs.existsSync(this.scheduleFile)) {
      throw new Error('크롤링 스케줄 파일을 찾을 수 없습니다')
    }
    
    this.schedule = JSON.parse(fs.readFileSync(this.scheduleFile, 'utf8'))
    console.log(`✅ 스케줄 로드 완료: ${this.schedule.overview.total_days}일 계획`)
  }

  async checkVpnStatus() {
    console.log('🌐 VPN 상태 확인 중...')
    
    // WARP 상태 확인
    const warpStatus = await this.executeCommand('warp-cli status')
    console.log('Cloudflare WARP:', warpStatus ? '연결됨' : '연결되지 않음')
    
    // NordVPN 상태 확인
    const nordStatus = await this.executeCommand('nordvpn status')
    console.log('NordVPN:', nordStatus ? '확인됨' : '확인되지 않음')
    
    // 현재 IP 확인
    const currentIp = await this.executeCommand('curl -s ifconfig.me')
    console.log(`현재 IP: ${currentIp}`)
    
    // VPN 로그 시작
    this.logVpnStatus(currentIp, warpStatus, nordStatus)
  }

  async startWorkers() {
    console.log('👥 워커 시작 중...')
    
    const today = new Date().toISOString().split('T')[0]
    const todaySchedule = this.schedule.daily_schedule[today]
    
    if (!todaySchedule) {
      console.log('⚠️  오늘 스케줄이 없습니다')
      return
    }
    
    console.log(`📅 ${this.stats.current_day}일차 작업 시작`)
    
    // 각 워커별로 크롤링 시작
    for (const [workerId, workerData] of Object.entries(todaySchedule.workers)) {
      if (workerData.target_count > 0) {
        await this.startWorker(workerId, workerData)
        
        // 워커 시작 간격 (10초)
        await this.sleep(10000)
      }
    }
    
    this.isRunning = true
    this.stats.start_time = new Date()
  }

  async startWorker(workerId, workerData) {
    console.log(`🔧 ${workerId} 시작: ${workerData.target_count}개 단지 (${workerData.vpn_profile})`)
    
    const logFile = path.join(this.logsDir, `${workerId}_${new Date().toISOString().split('T')[0]}.log`)
    const errorLogFile = path.join(this.logsDir, `${workerId}_errors.log`)
    
    // 크롤링 스크립트 실행 (Python)
    const crawlerScript = '/Users/seongjunkim/projects/real-estate-platform/modules/naver-crawler/core/enhanced_naver_crawler.py'
    
    const worker = spawn('python3', [
      crawlerScript,
      '--worker-id', workerId,
      '--vpn-profile', workerData.vpn_profile,
      '--target-count', workerData.target_count.toString(),
      '--regions', workerData.regions.join(','),
      '--log-file', logFile
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, WORKER_ID: workerId }
    })
    
    // 로그 처리
    worker.stdout.on('data', (data) => {
      const message = data.toString()
      console.log(`[${workerId}] ${message}`)
      this.updateStats(workerId, message)
    })
    
    worker.stderr.on('data', (data) => {
      const error = data.toString()
      console.error(`[${workerId}] ERROR: ${error}`)
      fs.appendFileSync(errorLogFile, `${new Date().toISOString()} - ${error}\n`)
      this.stats.error_count++
    })
    
    worker.on('close', (code) => {
      console.log(`[${workerId}] 종료됨 (코드: ${code})`)
      this.onWorkerComplete(workerId, code)
    })
    
    this.workers.push({
      id: workerId,
      process: worker,
      data: workerData,
      startTime: new Date()
    })
  }

  updateStats(workerId, message) {
    // 성공 메시지 파싱
    if (message.includes('SUCCESS') || message.includes('완료')) {
      this.stats.success_count++
      this.stats.total_processed++
    }
  }

  onWorkerComplete(workerId, exitCode) {
    const workerIndex = this.workers.findIndex(w => w.id === workerId)
    if (workerIndex !== -1) {
      this.workers.splice(workerIndex, 1)
    }
    
    // 모든 워커 완료시
    if (this.workers.length === 0) {
      this.onDayComplete()
    }
  }

  onDayComplete() {
    console.log(`\n🎉 ${this.stats.current_day}일차 완료!`)
    console.log(`   • 처리된 단지: ${this.stats.total_processed}개`)
    console.log(`   • 성공: ${this.stats.success_count}개`)
    console.log(`   • 실패: ${this.stats.error_count}개`)
    
    const successRate = (this.stats.success_count / this.stats.total_processed * 100).toFixed(1)
    console.log(`   • 성공률: ${successRate}%`)
    
    // 다음날 준비
    this.stats.current_day++
    this.isRunning = false
    
    // 성공률이 90% 이하면 경고
    if (parseFloat(successRate) < 90) {
      console.log('⚠️  성공률이 90% 이하입니다. VPN 상태를 확인하세요.')
    }
  }

  startMonitoring() {
    console.log('📊 실시간 모니터링 시작\n')
    
    const monitoringInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(monitoringInterval)
        return
      }
      
      const elapsed = Math.floor((new Date() - this.stats.start_time) / 1000 / 60) // 분
      const rate = this.stats.total_processed / (elapsed || 1) * 60 // 시간당
      
      console.log(`\n📊 [${elapsed}분 경과] 처리: ${this.stats.total_processed}개, 속도: ${rate.toFixed(1)}개/시간`)
      console.log(`   워커 상태: ${this.workers.map(w => `${w.id}(실행중)`).join(', ')}`)
      
    }, 60000) // 1분마다
  }

  logVpnStatus(ip, warpStatus, nordStatus) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      ip: ip,
      warp: warpStatus ? 'connected' : 'disconnected',
      nord: nordStatus ? 'available' : 'unavailable'
    }
    
    const logFile = path.join(this.vpnLogsDir, `vpn_status_${new Date().toISOString().split('T')[0]}.log`)
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n')
  }

  async executeCommand(command) {
    return new Promise((resolve) => {
      const process = spawn('bash', ['-c', command])
      let output = ''
      
      process.stdout.on('data', (data) => {
        output += data.toString()
      })
      
      process.on('close', (code) => {
        resolve(code === 0 ? output.trim() : null)
      })
      
      setTimeout(() => {
        process.kill()
        resolve(null)
      }, 5000) // 5초 타임아웃
    })
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// 실행
if (require.main === module) {
  const manager = new AdvancedCrawlingManager()
  
  // 종료 시그널 처리
  process.on('SIGINT', () => {
    console.log('\n🛑 크롤링 중단 중...')
    manager.workers.forEach(worker => {
      worker.process.kill()
    })
    process.exit(0)
  })
  
  manager.start().catch(console.error)
}

module.exports = AdvancedCrawlingManager