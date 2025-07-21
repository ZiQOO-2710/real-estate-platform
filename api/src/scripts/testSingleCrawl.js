#!/usr/bin/env node

/**
 * 단일 단지 크롤링 테스트
 * Python 모듈 문제 해결 후 테스트용
 */

const { spawn } = require('child_process')
const path = require('path')

class SingleCrawlTester {
  constructor() {
    this.crawlerDir = '/Users/seongjunkim/projects/real-estate-platform/modules/naver-crawler'
  }

  async testCrawl() {
    console.log('🧪 단일 크롤링 테스트 시작')
    console.log('=' .repeat(50))
    
    try {
      // 1. Python 환경 확인
      await this.checkPythonEnvironment()
      
      // 2. 단일 단지 크롤링 테스트
      await this.runSingleCrawl()
      
    } catch (error) {
      console.error('❌ 테스트 실패:', error.message)
    }
  }

  async checkPythonEnvironment() {
    console.log('🐍 Python 환경 확인 중...')
    
    const pythonVersion = await this.executeCommand('python3 --version')
    console.log(`Python 버전: ${pythonVersion}`)
    
    // 모듈 임포트 테스트
    const testScript = `
import sys
print("Python path:", sys.path[0])

try:
    import asyncio
    print("✅ asyncio 임포트 성공")
except Exception as e:
    print("❌ asyncio 임포트 실패:", e)

try:
    from playwright.async_api import async_playwright
    print("✅ playwright 임포트 성공")
except Exception as e:
    print("❌ playwright 임포트 실패:", e)

try:
    import pandas
    print("✅ pandas 임포트 성공")
except Exception as e:
    print("❌ pandas 임포트 실패:", e)
`

    const result = await this.executeCommand(`cd ${this.crawlerDir} && python3 -c "${testScript.replace(/\n/g, '; ')}"`)
    console.log(result)
  }

  async runSingleCrawl() {
    console.log('\n🏢 단일 단지 크롤링 테스트...')
    
    // 간단한 테스트 스크립트 생성
    const testScript = `
import asyncio
import sys
import os

# 경로 추가
sys.path.append('${this.crawlerDir}')

async def test_single_complex():
    print("🔍 테스트 시작...")
    
    # 네이버 랜딩 페이지만 접속 테스트
    try:
        from playwright.async_api import async_playwright
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            
            # User-Agent 설정
            await page.set_extra_http_headers({
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            })
            
            # 네이버 부동산 메인 페이지 접속
            await page.goto('https://new.land.naver.com/', wait_until='domcontentloaded')
            title = await page.title()
            print(f"✅ 페이지 접속 성공: {title}")
            
            # 현재 IP 확인
            ip_page = await browser.new_page()
            await ip_page.goto('https://ifconfig.me')
            ip = await ip_page.text_content('body')
            print(f"🌐 현재 IP: {ip.strip()}")
            
            await browser.close()
            print("🎉 테스트 완료!")
            
    except Exception as e:
        print(f"❌ 테스트 실패: {e}")

if __name__ == "__main__":
    asyncio.run(test_single_complex())
`

    // 테스트 파일 생성
    const testFile = path.join(this.crawlerDir, 'test_single.py')
    require('fs').writeFileSync(testFile, testScript)
    
    console.log('📄 테스트 스크립트 생성 완료')
    
    // 테스트 실행
    const result = await this.executeCommand(`cd ${this.crawlerDir} && python3 test_single.py`)
    console.log(result)
  }

  async executeCommand(command) {
    return new Promise((resolve, reject) => {
      const process = spawn('bash', ['-c', command])
      let output = ''
      let error = ''
      
      process.stdout.on('data', (data) => {
        output += data.toString()
      })
      
      process.stderr.on('data', (data) => {
        error += data.toString()
      })
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim())
        } else {
          reject(new Error(error || `Command failed with code ${code}`))
        }
      })
      
      setTimeout(() => {
        process.kill()
        reject(new Error('Command timeout'))
      }, 30000) // 30초 타임아웃
    })
  }
}

// 실행
if (require.main === module) {
  const tester = new SingleCrawlTester()
  tester.testCrawl().catch(console.error)
}

module.exports = SingleCrawlTester