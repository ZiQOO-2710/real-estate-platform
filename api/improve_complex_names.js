const db = require('./src/config/database');

/**
 * 복합단지 이름 개선 스크립트
 * current_listings의 description에서 실제 단지명을 추출하여 apartment_complexes 테이블 업데이트
 */

// 한국어 아파트 단지명 패턴 정의
const COMPLEX_NAME_PATTERNS = [
  // 일반적인 패턴들
  /^([가-힣\w\s]+(?:아파트|빌라|하우스|타워|팰리스|파크|힐|빌|캐슬|마을|단지))\s/,
  /([가-힣\w\s]+(?:아파트|빌라|하우스|타워|팰리스|파크|힐|빌|캐슬|마을|단지))\s+\d+동/,
  /집주인([가-힣\w\s]+(?:아파트|빌라|하우스|타워|팰리스|파크|힐|빌|캐슬|마을|단지))/,
  /^([가-힣\w\s]+)\s+\d+동\s*(?:매매|전세|월세)/,
  // 브랜드 아파트 패턴
  /([가-힣\w\s]*(?:푸르지오|래미안|아이파크|롯데캐슬|자이|더샵|포레나|센트럴|위브|트리플|SK뷰|GS|대우|한화|삼성|LG)[가-힣\w\s]*)/,
];

// 일반적인 아파트 브랜드 및 키워드
const APARTMENT_BRANDS = [
  '푸르지오', '래미안', '아이파크', '롯데캐슬', '자이', '더샵', '포레나', 
  '센트럴', '위브', '트리플', 'SK뷰', 'GS', '대우', '한화', '삼성', 'LG',
  '아파트', '빌라', '하우스', '타워', '팰리스', '파크', '힐', '빌', '캐슬', '마을', '단지'
];

/**
 * description에서 복합단지명 추출
 */
function extractComplexName(description) {
  if (!description) return null;
  
  // 각 패턴을 시도해서 매치되는 첫 번째 결과 반환
  for (const pattern of COMPLEX_NAME_PATTERNS) {
    const match = description.match(pattern);
    if (match && match[1]) {
      let complexName = match[1].trim();
      
      // 불필요한 접두사 제거
      complexName = complexName.replace(/^집주인\s*/, '');
      
      // 너무 짧거나 긴 이름 필터링
      if (complexName.length >= 2 && complexName.length <= 30) {
        return complexName;
      }
    }
  }
  
  return null;
}

/**
 * 복합단지별 가장 빈도 높은 이름 찾기
 */
async function findMostFrequentComplexName(complexId) {
  const listings = await db.queryNaver(
    'SELECT description, raw_text FROM current_listings WHERE complex_id = ?',
    [complexId]
  );
  
  const nameCount = {};
  
  for (const listing of listings) {
    const name1 = extractComplexName(listing.description);
    const name2 = extractComplexName(listing.raw_text);
    
    if (name1) nameCount[name1] = (nameCount[name1] || 0) + 1;
    if (name2 && name1 !== name2) nameCount[name2] = (nameCount[name2] || 0) + 1;
  }
  
  // 가장 빈도 높은 이름 반환
  let maxCount = 0;
  let bestName = null;
  
  for (const [name, count] of Object.entries(nameCount)) {
    if (count > maxCount) {
      maxCount = count;
      bestName = name;
    }
  }
  
  return { name: bestName, count: maxCount, total: listings.length };
}

/**
 * 메인 개선 함수
 */
async function improveComplexNames() {
  try {
    console.log('🔍 복합단지 이름 개선 시작...');
    
    // 모든 복합단지 ID 가져오기
    const complexes = await db.queryNaver(
      'SELECT complex_id FROM apartment_complexes WHERE complex_name = "정보없음" OR complex_name IS NULL'
    );
    
    console.log(`📊 처리할 복합단지 수: ${complexes.length}`);
    
    let updated = 0;
    let failed = 0;
    
    for (const complex of complexes) {
      const result = await findMostFrequentComplexName(complex.complex_id);
      
      if (result.name && result.count >= 2) { // 최소 2회 이상 등장한 이름만 사용
        try {
          await db.queryNaver(
            'UPDATE apartment_complexes SET complex_name = ?, updated_at = CURRENT_TIMESTAMP WHERE complex_id = ?',
            [result.name, complex.complex_id]
          );
          
          console.log(`✅ ${complex.complex_id}: "${result.name}" (${result.count}/${result.total})`);
          updated++;
        } catch (error) {
          console.error(`❌ ${complex.complex_id}: 업데이트 실패 - ${error.message}`);
          failed++;
        }
      } else {
        console.log(`⏭️  ${complex.complex_id}: 적절한 이름을 찾을 수 없음`);
        failed++;
      }
    }
    
    console.log(`\n📈 결과 요약:`);
    console.log(`   ✅ 성공: ${updated}개`);
    console.log(`   ❌ 실패/건너뜀: ${failed}개`);
    console.log(`   📊 전체: ${complexes.length}개`);
    
  } catch (error) {
    console.error('❌ 복합단지 이름 개선 중 오류:', error);
  }
}

/**
 * 테스트 함수 - 특정 complex_id로 테스트
 */
async function testComplexNameExtraction(complexId) {
  console.log(`🧪 복합단지 ${complexId} 이름 추출 테스트...`);
  
  const result = await findMostFrequentComplexName(complexId);
  console.log('결과:', result);
  
  // 샘플 description들도 출력
  const samples = await db.queryNaver(
    'SELECT description FROM current_listings WHERE complex_id = ? LIMIT 5',
    [complexId]
  );
  
  console.log('\n샘플 descriptions:');
  samples.forEach((sample, index) => {
    const extracted = extractComplexName(sample.description);
    console.log(`${index + 1}. "${sample.description}"`);
    console.log(`   추출된 이름: "${extracted}"`);
  });
}

// 명령행 인수 처리
const args = process.argv.slice(2);
if (args.length > 0) {
  if (args[0] === 'test' && args[1]) {
    testComplexNameExtraction(args[1]);
  } else if (args[0] === 'run') {
    improveComplexNames();
  } else {
    console.log('사용법:');
    console.log('  node improve_complex_names.js test [complex_id] - 특정 단지 테스트');
    console.log('  node improve_complex_names.js run - 전체 개선 실행');
  }
} else {
  console.log('사용법:');
  console.log('  node improve_complex_names.js test [complex_id] - 특정 단지 테스트');
  console.log('  node improve_complex_names.js run - 전체 개선 실행');
}

module.exports = {
  extractComplexName,
  findMostFrequentComplexName,
  improveComplexNames,
  testComplexNameExtraction
};