/**
 * 데이터 정제 및 유효성 검사 서비스
 * 부동산 데이터의 품질을 보장하고 일관성을 유지
 */

class DataValidationService {
  constructor() {
    this.errors = []
    this.warnings = []
    this.corrections = []
  }

  /**
   * 통합 데이터 검증
   */
  validateIntegratedData(complexes, listings, transactions) {
    console.log('🔍 통합 데이터 검증 시작')
    
    const validationResults = {
      complexes: this.validateComplexes(complexes),
      listings: this.validateListings(listings),
      transactions: this.validateTransactions(transactions),
      crossValidation: this.validateDataConsistency(complexes, listings, transactions)
    }

    console.log('✅ 데이터 검증 완료:', this.getValidationSummary())
    return validationResults
  }

  /**
   * 단지 데이터 검증
   */
  validateComplexes(complexes) {
    const results = {
      valid: 0,
      invalid: 0,
      corrected: 0,
      issues: []
    }

    for (const complex of complexes) {
      const complexValidation = this.validateSingleComplex(complex)
      
      if (complexValidation.isValid) {
        results.valid++
      } else {
        results.invalid++
        results.issues.push({
          id: complex.complex_id,
          errors: complexValidation.errors
        })
      }

      if (complexValidation.corrected) {
        results.corrected++
      }
    }

    return results
  }

  /**
   * 개별 단지 검증
   */
  validateSingleComplex(complex) {
    const errors = []
    const warnings = []
    let corrected = false

    // 필수 필드 검증
    if (!complex.complex_id) {
      errors.push('단지 ID가 없습니다')
    }

    // 좌표 검증
    const coordValidation = this.validateCoordinates(complex.latitude, complex.longitude)
    if (!coordValidation.isValid) {
      errors.push(`좌표 오류: ${coordValidation.error}`)
    }

    // 주소 검증 및 정규화
    const addressValidation = this.validateAndNormalizeAddress(complex.address)
    if (addressValidation.corrected) {
      complex.normalized_address = addressValidation.normalized
      corrected = true
    }
    if (!addressValidation.isValid) {
      warnings.push(`주소 형식 문제: ${addressValidation.error}`)
    }

    // 단지명 검증
    const nameValidation = this.validateComplexName(complex.complex_name)
    if (nameValidation.corrected) {
      complex.cleaned_name = nameValidation.cleaned
      corrected = true
    }

    // 연도 검증
    if (complex.completion_year) {
      const yearValidation = this.validateYear(complex.completion_year)
      if (!yearValidation.isValid) {
        warnings.push(`준공년도 오류: ${yearValidation.error}`)
      }
    }

    // 세대수/동수 검증
    if (complex.total_households) {
      const householdValidation = this.validateHouseholdCount(complex.total_households)
      if (!householdValidation.isValid) {
        warnings.push(`세대수 오류: ${householdValidation.error}`)
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      corrected
    }
  }

  /**
   * 매물 데이터 검증
   */
  validateListings(listings) {
    const results = {
      valid: 0,
      invalid: 0,
      corrected: 0,
      issues: []
    }

    for (const listing of listings) {
      const listingValidation = this.validateSingleListing(listing)
      
      if (listingValidation.isValid) {
        results.valid++
      } else {
        results.invalid++
        results.issues.push({
          id: listing.id,
          errors: listingValidation.errors
        })
      }

      if (listingValidation.corrected) {
        results.corrected++
      }
    }

    return results
  }

  /**
   * 개별 매물 검증
   */
  validateSingleListing(listing) {
    const errors = []
    const warnings = []
    let corrected = false

    // 필수 필드 검증
    if (!listing.complex_id) {
      errors.push('단지 ID가 없습니다')
    }

    // 거래유형 검증
    const dealTypeValidation = this.validateDealType(listing.deal_type)
    if (!dealTypeValidation.isValid) {
      errors.push(`거래유형 오류: ${dealTypeValidation.error}`)
    }
    if (dealTypeValidation.corrected) {
      listing.standardized_deal_type = dealTypeValidation.standardized
      corrected = true
    }

    // 가격 검증
    const priceValidation = this.validatePrice(listing, listing.deal_type)
    if (!priceValidation.isValid) {
      errors.push(`가격 오류: ${priceValidation.error}`)
    }
    if (priceValidation.corrected) {
      Object.assign(listing, priceValidation.corrected)
      corrected = true
    }

    // 면적 검증
    const areaValidation = this.validateArea(listing.area_sqm)
    if (!areaValidation.isValid) {
      warnings.push(`면적 오류: ${areaValidation.error}`)
    }

    // 층수 검증
    const floorValidation = this.validateFloor(listing.floor_info)
    if (!floorValidation.isValid) {
      warnings.push(`층수 오류: ${floorValidation.error}`)
    }
    if (floorValidation.corrected) {
      listing.parsed_floor = floorValidation.parsed
      corrected = true
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      corrected
    }
  }

  /**
   * 실거래가 데이터 검증
   */
  validateTransactions(transactions) {
    const results = {
      valid: 0,
      invalid: 0,
      corrected: 0,
      issues: []
    }

    for (const transaction of transactions) {
      const transactionValidation = this.validateSingleTransaction(transaction)
      
      if (transactionValidation.isValid) {
        results.valid++
      } else {
        results.invalid++
        results.issues.push({
          id: transaction.id,
          errors: transactionValidation.errors
        })
      }

      if (transactionValidation.corrected) {
        results.corrected++
      }
    }

    return results
  }

  /**
   * 개별 실거래 검증
   */
  validateSingleTransaction(transaction) {
    const errors = []
    const warnings = []
    let corrected = false

    // 지역명 검증 (단지 매칭을 위해 필수)
    if (!transaction.region_name) {
      errors.push('지역명이 없습니다')
    }

    // 거래일 검증
    const dateValidation = this.validateTransactionDate(
      transaction.deal_year,
      transaction.deal_month,
      transaction.deal_day
    )
    if (!dateValidation.isValid) {
      errors.push(`거래일 오류: ${dateValidation.error}`)
    }
    if (dateValidation.corrected) {
      transaction.standardized_date = dateValidation.standardized
      corrected = true
    }

    // 거래가격 검증
    const priceValidation = this.validateTransactionPrice(
      transaction.deal_amount,
      transaction.deal_type
    )
    if (!priceValidation.isValid) {
      errors.push(`거래가격 오류: ${priceValidation.error}`)
    }

    // 면적 검증
    const areaValidation = this.validateArea(transaction.area)
    if (!areaValidation.isValid) {
      warnings.push(`면적 오류: ${areaValidation.error}`)
    }

    // 아파트명 정규화
    const nameValidation = this.validateComplexName(transaction.apartment_name)
    if (nameValidation.corrected) {
      transaction.normalized_apartment_name = nameValidation.cleaned
      corrected = true
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      corrected
    }
  }

  /**
   * 데이터 간 일관성 검증
   */
  validateDataConsistency(complexes, listings, transactions) {
    const issues = []

    // 1. 매물과 단지 연결성 검증
    const complexIds = new Set(complexes.map(c => c.complex_id))
    const orphanedListings = listings.filter(l => !complexIds.has(l.complex_id))
    
    if (orphanedListings.length > 0) {
      issues.push({
        type: 'orphaned_listings',
        count: orphanedListings.length,
        description: '연결된 단지가 없는 매물'
      })
    }

    // 2. 가격 일관성 검증 (매물 vs 실거래가)
    const priceInconsistencies = this.checkPriceConsistency(listings, transactions)
    if (priceInconsistencies.length > 0) {
      issues.push({
        type: 'price_inconsistencies',
        count: priceInconsistencies.length,
        description: '매물가격과 실거래가의 큰 차이'
      })
    }

    // 3. 지역 정보 일관성 검증
    const regionInconsistencies = this.checkRegionConsistency(complexes, transactions)
    if (regionInconsistencies.length > 0) {
      issues.push({
        type: 'region_inconsistencies',
        count: regionInconsistencies.length,
        description: '지역 정보 불일치'
      })
    }

    return {
      hasIssues: issues.length > 0,
      issues
    }
  }

  /**
   * 상세 검증 메서드들
   */
  validateCoordinates(latitude, longitude) {
    if (!latitude || !longitude) {
      return { isValid: false, error: '좌표가 없습니다' }
    }

    const lat = parseFloat(latitude)
    const lng = parseFloat(longitude)

    // 한국 영토 범위 검증
    if (lat < 33 || lat > 39) {
      return { isValid: false, error: '위도가 한국 범위를 벗어남' }
    }

    if (lng < 124 || lng > 132) {
      return { isValid: false, error: '경도가 한국 범위를 벗어남' }
    }

    // 정밀도 검증 (소수점 6자리까지)
    if (lat.toString().split('.')[1]?.length > 6) {
      return { isValid: false, error: '위도 정밀도가 너무 높음' }
    }

    if (lng.toString().split('.')[1]?.length > 6) {
      return { isValid: false, error: '경도 정밀도가 너무 높음' }
    }

    return { isValid: true }
  }

  validateAndNormalizeAddress(address) {
    if (!address) {
      return { isValid: false, error: '주소가 없습니다' }
    }

    let normalized = address
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s가-힣0-9-]/g, '')

    const corrections = []

    // 주소 구성요소 검증
    const hasRegion = /[가-힣]+(시|도|특별시|광역시|특별자치시|특별자치도)/.test(normalized)
    const hasDistrict = /[가-힣]+(구|군|시)/.test(normalized)
    
    if (!hasRegion) {
      corrections.push('시도 정보 누락')
    }
    
    if (!hasDistrict) {
      corrections.push('시군구 정보 누락')
    }

    // 번지수 정규화
    normalized = normalized.replace(/(\d+)번지?(\d+)?호?/g, '$1-$2')

    return {
      isValid: corrections.length === 0,
      normalized,
      corrected: normalized !== address,
      error: corrections.join(', ')
    }
  }

  validateComplexName(name) {
    if (!name || name === '정보없음') {
      return { 
        isValid: false, 
        error: '단지명이 없거나 유효하지 않음',
        cleaned: null
      }
    }

    let cleaned = name
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s가-힣0-9]/g, '')

    // 아파트, 타운하우스 등 접미사 정규화
    const suffixPatterns = [
      /아파트$/,
      /APT$/i,
      /타운하우스$/,
      /빌라$/,
      /연립$/
    ]

    let standardizedSuffix = false
    for (const pattern of suffixPatterns) {
      if (pattern.test(cleaned) && !cleaned.endsWith('아파트')) {
        cleaned = cleaned.replace(pattern, '아파트')
        standardizedSuffix = true
        break
      }
    }

    return {
      isValid: true,
      cleaned,
      corrected: cleaned !== name || standardizedSuffix
    }
  }

  validateYear(year) {
    const currentYear = new Date().getFullYear()
    const yearNum = parseInt(year)

    if (isNaN(yearNum)) {
      return { isValid: false, error: '연도가 숫자가 아님' }
    }

    if (yearNum < 1950 || yearNum > currentYear + 5) {
      return { isValid: false, error: '연도가 유효 범위를 벗어남' }
    }

    return { isValid: true }
  }

  validateHouseholdCount(count) {
    const countNum = parseInt(count)

    if (isNaN(countNum)) {
      return { isValid: false, error: '세대수가 숫자가 아님' }
    }

    if (countNum < 1 || countNum > 50000) {
      return { isValid: false, error: '세대수가 유효 범위를 벗어남' }
    }

    return { isValid: true }
  }

  validateDealType(dealType) {
    const validTypes = ['매매', '전세', '월세', '단기임대']
    const typeMap = {
      '매매': '매매',
      '전세': '전세',
      '월세': '월세',
      '임대': '월세',
      '단기임대': '단기임대',
      'sale': '매매',
      'jeonse': '전세',
      'rent': '월세',
      'monthly': '월세'
    }

    if (!dealType) {
      return { isValid: false, error: '거래유형이 없습니다' }
    }

    const standardized = typeMap[dealType] || dealType

    return {
      isValid: validTypes.includes(standardized),
      standardized,
      corrected: standardized !== dealType
    }
  }

  validatePrice(listing, dealType) {
    const errors = []
    const corrected = {}

    // 매매가 검증
    if (dealType === '매매' && listing.price_amount) {
      const price = parseInt(String(listing.price_amount).replace(/[^\d]/g, ''))
      if (price < 1000 || price > 1000000) { // 100만원 ~ 100억원
        errors.push('매매가가 유효 범위를 벗어남')
      } else {
        corrected.standardized_price = price
      }
    }

    // 전세가 검증
    if ((dealType === '전세' || dealType === '월세') && listing.deposit_amount) {
      const deposit = parseInt(String(listing.deposit_amount).replace(/[^\d]/g, ''))
      if (deposit < 0 || deposit > 500000) { // 0원 ~ 50억원
        errors.push('보증금이 유효 범위를 벗어남')
      } else {
        corrected.standardized_deposit = deposit
      }
    }

    // 월세 검증
    if (dealType === '월세' && listing.monthly_rent) {
      const monthly = parseInt(String(listing.monthly_rent).replace(/[^\d]/g, ''))
      if (monthly < 10 || monthly > 5000) { // 1만원 ~ 500만원
        errors.push('월세가 유효 범위를 벗어남')
      } else {
        corrected.standardized_monthly = monthly
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      corrected: Object.keys(corrected).length > 0 ? corrected : null
    }
  }

  validateArea(area) {
    if (!area) {
      return { isValid: false, error: '면적이 없습니다' }
    }

    const areaNum = parseFloat(area)

    if (isNaN(areaNum)) {
      return { isValid: false, error: '면적이 숫자가 아님' }
    }

    if (areaNum < 10 || areaNum > 1000) { // 10㎡ ~ 1000㎡
      return { isValid: false, error: '면적이 유효 범위를 벗어남' }
    }

    return { isValid: true }
  }

  validateFloor(floorInfo) {
    if (!floorInfo) {
      return { isValid: false, error: '층 정보가 없습니다' }
    }

    // "3/15층", "3층", "지하1층" 등 다양한 형태 파싱
    const patterns = [
      /(\d+)\/(\d+)층?/,  // "3/15층"
      /(\d+)층/,          // "3층"
      /지하(\d+)층?/,      // "지하1층"
      /(\d+)F/i           // "3F"
    ]

    for (const pattern of patterns) {
      const match = floorInfo.match(pattern)
      if (match) {
        let currentFloor, totalFloor

        if (pattern.source.includes('지하')) {
          currentFloor = -parseInt(match[1])
        } else if (pattern.source.includes('\\/')) {
          currentFloor = parseInt(match[1])
          totalFloor = parseInt(match[2])
        } else {
          currentFloor = parseInt(match[1])
        }

        // 유효성 검사
        if (currentFloor < -10 || currentFloor > 200) {
          return { isValid: false, error: '층수가 유효 범위를 벗어남' }
        }

        if (totalFloor && (totalFloor < 1 || totalFloor > 200)) {
          return { isValid: false, error: '총층수가 유효 범위를 벗어남' }
        }

        return {
          isValid: true,
          parsed: { currentFloor, totalFloor },
          corrected: true
        }
      }
    }

    return { isValid: false, error: '층 정보 형식을 인식할 수 없음' }
  }

  validateTransactionDate(year, month, day) {
    if (!year || !month || !day) {
      return { isValid: false, error: '거래일 정보가 불완전함' }
    }

    const yearNum = parseInt(year)
    const monthNum = parseInt(month)
    const dayNum = parseInt(day)

    const currentYear = new Date().getFullYear()

    if (yearNum < 2000 || yearNum > currentYear) {
      return { isValid: false, error: '거래년도가 유효 범위를 벗어남' }
    }

    if (monthNum < 1 || monthNum > 12) {
      return { isValid: false, error: '거래월이 유효 범위를 벗어남' }
    }

    if (dayNum < 1 || dayNum > 31) {
      return { isValid: false, error: '거래일이 유효 범위를 벗어남' }
    }

    // 날짜 유효성 추가 검증
    try {
      const date = new Date(yearNum, monthNum - 1, dayNum)
      if (date.getFullYear() !== yearNum || 
          date.getMonth() !== monthNum - 1 || 
          date.getDate() !== dayNum) {
        return { isValid: false, error: '존재하지 않는 날짜' }
      }

      const standardized = date.toISOString().split('T')[0]
      
      return {
        isValid: true,
        standardized,
        corrected: true
      }
    } catch (error) {
      return { isValid: false, error: '날짜 생성 실패' }
    }
  }

  validateTransactionPrice(amount, dealType) {
    if (!amount) {
      return { isValid: false, error: '거래가격이 없습니다' }
    }

    // 문자열에서 숫자 추출
    const priceNum = parseInt(String(amount).replace(/[^\d]/g, ''))

    if (isNaN(priceNum)) {
      return { isValid: false, error: '거래가격이 숫자가 아님' }
    }

    // 거래유형별 가격 범위 검증
    let minPrice, maxPrice
    
    switch (dealType) {
      case '매매':
        minPrice = 1000    // 100만원
        maxPrice = 2000000 // 200억원
        break
      case '전세':
        minPrice = 500     // 50만원
        maxPrice = 1000000 // 100억원
        break
      case '월세':
        minPrice = 10      // 1만원
        maxPrice = 10000   // 1000만원
        break
      default:
        minPrice = 0
        maxPrice = Number.MAX_SAFE_INTEGER
    }

    if (priceNum < minPrice || priceNum > maxPrice) {
      return { 
        isValid: false, 
        error: `${dealType} 거래가격이 유효 범위(${minPrice}~${maxPrice}만원)를 벗어남` 
      }
    }

    return { isValid: true }
  }

  checkPriceConsistency(listings, transactions) {
    // 매물가격과 실거래가의 일관성 검증
    const inconsistencies = []
    
    // 구현 로직: 같은 지역/단지의 매물가격과 실거래가를 비교
    // 큰 차이가 있는 경우 불일치로 판정
    
    return inconsistencies
  }

  checkRegionConsistency(complexes, transactions) {
    // 단지 주소와 실거래 지역명의 일관성 검증
    const inconsistencies = []
    
    // 구현 로직: 단지의 주소 정보와 실거래의 지역명이 일치하는지 확인
    
    return inconsistencies
  }

  getValidationSummary() {
    return {
      totalErrors: this.errors.length,
      totalWarnings: this.warnings.length,
      totalCorrections: this.corrections.length,
      errors: this.errors,
      warnings: this.warnings,
      corrections: this.corrections
    }
  }

  /**
   * 데이터 품질 점수 계산
   */
  calculateQualityScore(validationResults) {
    let totalRecords = 0
    let validRecords = 0
    let issues = 0

    Object.values(validationResults).forEach(result => {
      if (result.valid !== undefined) {
        totalRecords += result.valid + result.invalid
        validRecords += result.valid
        issues += result.issues ? result.issues.length : 0
      }
    })

    const validityScore = totalRecords > 0 ? (validRecords / totalRecords) * 100 : 0
    const issueScore = Math.max(0, 100 - issues)
    
    return {
      overall: (validityScore + issueScore) / 2,
      validity: validityScore,
      issues: issueScore,
      totalRecords,
      validRecords,
      issueCount: issues
    }
  }
}

module.exports = DataValidationService