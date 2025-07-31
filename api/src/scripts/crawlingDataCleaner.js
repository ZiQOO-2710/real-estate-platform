#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

class CrawlingDataCleaner {
  constructor() {
    this.outputDir = '/Users/seongjunkim/projects/real-estate-platform/modules/naver-crawler/data/output'
    this.cleanupDir = '/Users/seongjunkim/projects/real-estate-platform/backup/cleanup'
    
    this.stats = {
      total_files: 0,
      unique_complexes: 0,
      duplicate_files: 0,
      small_files: 0,
      large_files: 0,
      deleted_files: 0,
      moved_files: 0,
      kept_files: 0
    }
  }

  async analyzeFiles() {
    console.log('🔍 크롤링 파일 분석 중...')
    console.log('='.repeat(50))

    const files = fs.readdirSync(this.outputDir)
      .filter(file => file.startsWith('enhanced_complex_') && file.endsWith('.json'))
      .sort()

    this.stats.total_files = files.length

    // 파일별 정보 수집
    const fileInfo = new Map()
    const complexGroups = new Map()

    for (const fileName of files) {
      const match = fileName.match(/enhanced_complex_(\d+)_(\d{8}_\d{6})\.json/)
      if (!match) continue

      const complexId = match[1]
      const timestamp = match[2]
      const filePath = path.join(this.outputDir, fileName)
      const stats = fs.statSync(filePath)

      const info = {
        fileName,
        complexId,
        timestamp,
        size: stats.size,
        date: new Date(`${timestamp.substring(0,4)}-${timestamp.substring(4,6)}-${timestamp.substring(6,8)} ${timestamp.substring(9,11)}:${timestamp.substring(11,13)}:${timestamp.substring(13,15)}`),
        hasContent: this.hasValidContent(filePath)
      }

      fileInfo.set(fileName, info)

      // 같은 complex_id별로 그룹핑
      if (!complexGroups.has(complexId)) {
        complexGroups.set(complexId, [])
      }
      complexGroups.get(complexId).push(info)
    }

    this.stats.unique_complexes = complexGroups.size

    console.log(`📊 분석 결과:`)
    console.log(`   • 총 파일 수: ${this.stats.total_files}개`)
    console.log(`   • 고유 단지 수: ${this.stats.unique_complexes}개`)
    console.log(`   • 평균 중복도: ${(this.stats.total_files / this.stats.unique_complexes).toFixed(1)}개/단지`)

    return { fileInfo, complexGroups }
  }

  hasValidContent(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      const data = JSON.parse(content)
      
      // 유효한 내용이 있는지 확인
      const listings = data.current_listings || []
      const hasListings = listings.length > 0
      const hasValidListings = listings.some(listing => 
        listing.text && listing.text.length > 10 && 
        !listing.text.includes('정보없음')
      )
      
      return hasListings && hasValidListings
    } catch (error) {
      return false
    }
  }

  async identifyCleanupCandidates(complexGroups) {
    console.log('\n🗂️ 정리 대상 파일 식별 중...')
    
    const toDelete = []
    const toKeep = []
    const duplicateGroups = []

    for (const [complexId, files] of complexGroups) {
      if (files.length <= 1) {
        // 단일 파일은 유지
        toKeep.push(...files)
        continue
      }

      // 중복 파일들 분석
      duplicateGroups.push({ complexId, count: files.length, files })

      // 파일들을 품질 및 날짜순으로 정렬
      const sortedFiles = files.sort((a, b) => {
        // 1. 유효한 콘텐츠가 있는 파일 우선
        if (a.hasContent !== b.hasContent) {
          return b.hasContent - a.hasContent
        }
        // 2. 파일 크기가 큰 파일 우선 (더 많은 데이터)
        if (Math.abs(a.size - b.size) > 1000) {
          return b.size - a.size
        }
        // 3. 최신 파일 우선
        return b.date - a.date
      })

      // 최고 품질 파일 1개만 유지, 나머지는 삭제 대상
      const bestFile = sortedFiles[0]
      const duplicateFiles = sortedFiles.slice(1)

      toKeep.push(bestFile)
      toDelete.push(...duplicateFiles)

      console.log(`   📁 단지 ${complexId}: ${files.length}개 → 1개 유지 (${duplicateFiles.length}개 삭제)`)
      if (files.length > 5) {
        console.log(`      ⭐ 유지: ${bestFile.fileName} (${(bestFile.size/1024).toFixed(1)}KB, ${bestFile.hasContent ? '유효' : '무효'})`)
      }
    }

    // 작은 파일들 (1KB 미만) 추가 식별
    const smallFiles = toKeep.filter(file => file.size < 1000)
    console.log(`\n🔍 추가 정리 대상:`)
    console.log(`   • 작은 파일 (1KB 미만): ${smallFiles.length}개`)
    
    this.stats.duplicate_files = toDelete.length
    this.stats.small_files = smallFiles.length

    return {
      toDelete,
      toKeep: toKeep.filter(file => file.size >= 1000), // 작은 파일 제외
      smallFiles,
      duplicateGroups: duplicateGroups.filter(group => group.count > 3) // 3개 이상 중복된 것만
    }
  }

  async createCleanupPlan(cleanupCandidates) {
    console.log('\n📋 정리 계획 수립 중...')

    const plan = {
      summary: {
        current_files: this.stats.total_files,
        files_to_delete: cleanupCandidates.toDelete.length + cleanupCandidates.smallFiles.length,
        files_to_keep: cleanupCandidates.toKeep.length,
        space_to_free: 0
      },
      actions: {
        delete_duplicates: cleanupCandidates.toDelete,
        delete_small_files: cleanupCandidates.smallFiles,
        keep_files: cleanupCandidates.toKeep
      },
      top_duplicates: cleanupCandidates.duplicateGroups.slice(0, 10)
    }

    // 절약될 공간 계산
    const duplicateSize = cleanupCandidates.toDelete.reduce((sum, file) => sum + file.size, 0)
    const smallFileSize = cleanupCandidates.smallFiles.reduce((sum, file) => sum + file.size, 0)
    plan.summary.space_to_free = duplicateSize + smallFileSize

    console.log(`📊 정리 계획 요약:`)
    console.log(`   • 현재 파일: ${plan.summary.current_files}개`)
    console.log(`   • 삭제 예정: ${plan.summary.files_to_delete}개`)
    console.log(`   • 유지 예정: ${plan.summary.files_to_keep}개`)
    console.log(`   • 절약 공간: ${(plan.summary.space_to_free / 1024 / 1024).toFixed(1)}MB`)
    console.log(`   • 압축률: ${((plan.summary.files_to_delete / plan.summary.current_files) * 100).toFixed(1)}%`)

    return plan
  }

  async executeCleanup(plan, dryRun = true) {
    console.log(`\n${dryRun ? '🧪 시뮬레이션' : '🚀 실제 정리'} 실행 중...`)

    if (!dryRun) {
      // 백업 디렉토리 생성
      if (!fs.existsSync(this.cleanupDir)) {
        fs.mkdirSync(this.cleanupDir, { recursive: true })
      }
    }

    let deletedCount = 0
    let deletedSize = 0

    // 중복 파일 삭제
    for (const file of plan.actions.delete_duplicates) {
      const filePath = path.join(this.outputDir, file.fileName)
      
      if (dryRun) {
        console.log(`   🗑️ [시뮬레이션] 삭제: ${file.fileName} (${(file.size/1024).toFixed(1)}KB)`)
      } else {
        try {
          // 백업 후 삭제
          const backupPath = path.join(this.cleanupDir, 'duplicates', file.fileName)
          fs.mkdirSync(path.dirname(backupPath), { recursive: true })
          fs.copyFileSync(filePath, backupPath)
          fs.unlinkSync(filePath)
          console.log(`   ✅ 삭제: ${file.fileName}`)
        } catch (error) {
          console.error(`   ❌ 삭제 실패: ${file.fileName} - ${error.message}`)
          continue
        }
      }
      
      deletedCount++
      deletedSize += file.size
    }

    // 작은 파일 삭제
    for (const file of plan.actions.delete_small_files) {
      const filePath = path.join(this.outputDir, file.fileName)
      
      if (dryRun) {
        console.log(`   🗑️ [시뮬레이션] 작은 파일 삭제: ${file.fileName} (${file.size}B)`)
      } else {
        try {
          const backupPath = path.join(this.cleanupDir, 'small_files', file.fileName)
          fs.mkdirSync(path.dirname(backupPath), { recursive: true })
          fs.copyFileSync(filePath, backupPath)
          fs.unlinkSync(filePath)
          console.log(`   ✅ 작은 파일 삭제: ${file.fileName}`)
        } catch (error) {
          console.error(`   ❌ 삭제 실패: ${file.fileName} - ${error.message}`)
          continue
        }
      }
      
      deletedCount++
      deletedSize += file.size
    }

    this.stats.deleted_files = deletedCount
    this.stats.kept_files = plan.actions.keep_files.length

    console.log(`\n${dryRun ? '🧪 시뮬레이션' : '✅ 정리'} 완료:`)
    console.log(`   • 처리된 파일: ${deletedCount}개`)
    console.log(`   • 절약된 공간: ${(deletedSize / 1024 / 1024).toFixed(1)}MB`)
    console.log(`   • 남은 파일: ${plan.actions.keep_files.length}개`)

    return {
      deleted: deletedCount,
      size_freed: deletedSize,
      remaining: plan.actions.keep_files.length
    }
  }

  async generateReport(plan, result) {
    const reportPath = path.join(this.cleanupDir, 'cleanup_report.txt')
    
    const report = `
크롤링 데이터 정리 보고서
========================
생성일시: ${new Date().toLocaleString('ko-KR')}

📊 정리 전 현황:
- 총 파일 수: ${this.stats.total_files}개
- 고유 단지 수: ${this.stats.unique_complexes}개
- 평균 중복도: ${(this.stats.total_files / this.stats.unique_complexes).toFixed(1)}개/단지

🗑️ 정리 결과:
- 삭제된 파일: ${result.deleted}개
- 절약된 공간: ${(result.size_freed / 1024 / 1024).toFixed(1)}MB
- 남은 파일: ${result.remaining}개
- 정리율: ${((result.deleted / this.stats.total_files) * 100).toFixed(1)}%

🔍 주요 중복 단지 (삭제 전):
${plan.top_duplicates.map(group => 
  `- 단지 ${group.complexId}: ${group.count}개 파일`
).join('\n')}

💾 백업 위치:
- 중복 파일: ${this.cleanupDir}/duplicates/
- 작은 파일: ${this.cleanupDir}/small_files/

⚠️ 복원 방법:
위 백업 디렉토리의 파일들을 원본 위치로 복사하면 복원 가능합니다.
`

    if (!fs.existsSync(this.cleanupDir)) {
      fs.mkdirSync(this.cleanupDir, { recursive: true })
    }
    
    fs.writeFileSync(reportPath, report)
    console.log(`\n📋 정리 보고서 생성: ${reportPath}`)
    
    return reportPath
  }

  async run(options = {}) {
    const { dryRun = true, autoConfirm = false } = options
    
    try {
      console.log('🧹 크롤링 데이터 정리 도구')
      console.log('='.repeat(50))
      
      // 1. 파일 분석
      const { fileInfo, complexGroups } = await this.analyzeFiles()
      
      // 2. 정리 대상 식별
      const cleanupCandidates = await this.identifyCleanupCandidates(complexGroups)
      
      // 3. 정리 계획 수립
      const plan = await this.createCleanupPlan(cleanupCandidates)
      
      // 4. 사용자 확인 (실제 삭제시)
      if (!dryRun && !autoConfirm) {
        console.log('\n⚠️  실제 파일 삭제를 진행하시겠습니까?')
        console.log('   이 작업은 되돌릴 수 없습니다. (백업은 생성됩니다)')
        console.log('   계속하려면 스크립트를 다시 실행하세요: node crawlingDataCleaner.js --execute')
        return
      }
      
      // 5. 정리 실행
      const result = await this.executeCleanup(plan, dryRun)
      
      // 6. 보고서 생성
      if (!dryRun) {
        await this.generateReport(plan, result)
      }
      
      console.log(`\n🎉 ${dryRun ? '시뮬레이션' : '정리'} 완료!`)
      
    } catch (error) {
      console.error('❌ 정리 실패:', error)
    }
  }
}

// 명령줄 인수 처리
const args = process.argv.slice(2)
const dryRun = !args.includes('--execute')
const autoConfirm = args.includes('--confirm')

// 실행
if (require.main === module) {
  const cleaner = new CrawlingDataCleaner()
  cleaner.run({ dryRun, autoConfirm })
}

module.exports = CrawlingDataCleaner