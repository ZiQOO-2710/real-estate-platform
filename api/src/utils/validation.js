/**
 * 입력 데이터 검증 유틸리티
 * @fileoverview TypeScript 스타일 JSDoc을 사용한 런타임 타입 안전성 제공
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid - 검증 결과
 * @property {string[]} errors - 오류 메시지 배열
 * @property {*} sanitized - 정제된 데이터
 */

/**
 * @typedef {Object} ComplexSearchParams
 * @property {string} [query] - 검색어
 * @property {number} [page] - 페이지 번호
 * @property {number} [limit] - 페이지당 항목 수
 * @property {string} [sort] - 정렬 방식
 * @property {string} [region] - 지역 코드
 */

/**
 * @typedef {Object} PaginationParams
 * @property {number} page - 페이지 번호 (1부터 시작)
 * @property {number} limit - 페이지당 항목 수 (최대 100)
 */

/**
 * 문자열 검증
 * @param {*} value - 검증할 값
 * @param {Object} options - 검증 옵션
 * @param {number} [options.minLength=0] - 최소 길이
 * @param {number} [options.maxLength=1000] - 최대 길이
 * @param {RegExp} [options.pattern] - 정규식 패턴
 * @param {boolean} [options.required=false] - 필수 여부
 * @returns {ValidationResult}
 */
function validateString(value, options = {}) {
  const {
    minLength = 0,
    maxLength = 1000,
    pattern,
    required = false
  } = options;

  const errors = [];

  // null/undefined 처리
  if (value == null) {
    if (required) {
      errors.push('값이 필요합니다');
    }
    return { isValid: !required, errors, sanitized: '' };
  }

  // 타입 검증
  if (typeof value !== 'string') {
    errors.push('문자열이어야 합니다');
    return { isValid: false, errors, sanitized: '' };
  }

  const trimmed = value.trim();

  // 필수 값 검증
  if (required && !trimmed) {
    errors.push('빈 문자열은 허용되지 않습니다');
  }

  // 길이 검증
  if (trimmed.length < minLength) {
    errors.push(`최소 ${minLength}글자 이상이어야 합니다`);
  }

  if (trimmed.length > maxLength) {
    errors.push(`최대 ${maxLength}글자 이하이어야 합니다`);
  }

  // 패턴 검증
  if (pattern && trimmed && !pattern.test(trimmed)) {
    errors.push('올바른 형식이 아닙니다');
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: trimmed
  };
}

/**
 * 숫자 검증
 * @param {*} value - 검증할 값
 * @param {Object} options - 검증 옵션
 * @param {number} [options.min] - 최솟값
 * @param {number} [options.max] - 최댓값
 * @param {boolean} [options.integer=false] - 정수 여부
 * @param {boolean} [options.required=false] - 필수 여부
 * @returns {ValidationResult}
 */
function validateNumber(value, options = {}) {
  const {
    min,
    max,
    integer = false,
    required = false
  } = options;

  const errors = [];

  // null/undefined 처리
  if (value == null) {
    if (required) {
      errors.push('숫자가 필요합니다');
    }
    return { isValid: !required, errors, sanitized: null };
  }

  // 문자열인 경우 숫자로 변환 시도
  const num = typeof value === 'string' ? Number(value) : value;

  // 숫자 검증
  if (typeof num !== 'number' || isNaN(num)) {
    errors.push('올바른 숫자가 아닙니다');
    return { isValid: false, errors, sanitized: null };
  }

  // 정수 검증
  if (integer && !Number.isInteger(num)) {
    errors.push('정수여야 합니다');
  }

  // 범위 검증
  if (typeof min === 'number' && num < min) {
    errors.push(`${min} 이상이어야 합니다`);
  }

  if (typeof max === 'number' && num > max) {
    errors.push(`${max} 이하여야 합니다`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: num
  };
}

/**
 * 페이지네이션 파라미터 검증
 * @param {*} params - 검증할 파라미터
 * @returns {ValidationResult}
 */
function validatePaginationParams(params) {
  const errors = [];
  const sanitized = {};

  // page 검증
  const pageResult = validateNumber(params.page, {
    min: 1,
    max: 10000,
    integer: true,
    required: false
  });

  if (!pageResult.isValid) {
    errors.push(`page: ${pageResult.errors.join(', ')}`);
  } else {
    sanitized.page = pageResult.sanitized || 1;
  }

  // limit 검증
  const limitResult = validateNumber(params.limit, {
    min: 1,
    max: 100,
    integer: true,
    required: false
  });

  if (!limitResult.isValid) {
    errors.push(`limit: ${limitResult.errors.join(', ')}`);
  } else {
    sanitized.limit = limitResult.sanitized || 20;
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized
  };
}

/**
 * 복합 검색 파라미터 검증
 * @param {*} params - 검증할 파라미터
 * @returns {ValidationResult}
 */
function validateComplexSearchParams(params) {
  const errors = [];
  const sanitized = {};

  // 페이지네이션 검증
  const paginationResult = validatePaginationParams(params);
  if (!paginationResult.isValid) {
    errors.push(...paginationResult.errors);
  } else {
    Object.assign(sanitized, paginationResult.sanitized);
  }

  // 검색어 검증
  if (params.query != null) {
    const queryResult = validateString(params.query, {
      maxLength: 100,
      pattern: /^[가-힣a-zA-Z0-9\s\-_()]+$/
    });

    if (!queryResult.isValid) {
      errors.push(`query: ${queryResult.errors.join(', ')}`);
    } else if (queryResult.sanitized) {
      sanitized.query = queryResult.sanitized;
    }
  }

  // 정렬 방식 검증
  if (params.sort != null) {
    const validSortOptions = ['name', 'price', 'area', 'date', '-name', '-price', '-area', '-date'];
    const sortResult = validateString(params.sort, { required: false });

    if (!sortResult.isValid) {
      errors.push(`sort: ${sortResult.errors.join(', ')}`);
    } else if (sortResult.sanitized && !validSortOptions.includes(sortResult.sanitized)) {
      errors.push('sort: 올바르지 않은 정렬 옵션입니다');
    } else if (sortResult.sanitized) {
      sanitized.sort = sortResult.sanitized;
    }
  }

  // 지역 코드 검증
  if (params.region != null) {
    const regionResult = validateString(params.region, {
      maxLength: 10,
      pattern: /^\d{5}$/
    });

    if (!regionResult.isValid) {
      errors.push(`region: ${regionResult.errors.join(', ')}`);
    } else if (regionResult.sanitized) {
      sanitized.region = regionResult.sanitized;
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized
  };
}

/**
 * SQL 인젝션 방지를 위한 문자열 정제
 * @param {string} str - 정제할 문자열
 * @returns {string} 정제된 문자열
 */
function sanitizeForSQL(str) {
  if (typeof str !== 'string') return '';
  
  return str
    .replace(/['"\\]/g, '') // 따옴표와 백슬래시 제거
    .replace(/[;\-]{2,}/g, '') // SQL 주석 제거
    .replace(/\b(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|TRUNCATE|EXEC)\b/gi, '') // 위험한 SQL 키워드 제거
    .trim();
}

/**
 * XSS 방지를 위한 HTML 이스케이프
 * @param {string} str - 이스케이프할 문자열
 * @returns {string} 이스케이프된 문자열
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  
  const escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;'
  };

  return str.replace(/[&<>"'/]/g, (char) => escapeMap[char]);
}

/**
 * 미들웨어: 요청 파라미터 검증
 * @param {Function} validator - 검증 함수
 * @returns {Function} Express 미들웨어
 */
function createValidationMiddleware(validator) {
  return (req, res, next) => {
    try {
      const params = { ...req.query, ...req.params, ...req.body };
      const result = validator(params);

      if (!result.isValid) {
        return res.status(400).json({
          error: 'Validation failed',
          message: '요청 데이터가 올바르지 않습니다',
          details: result.errors,
          timestamp: new Date().toISOString()
        });
      }

      // 검증된 데이터를 req.validated에 저장
      req.validated = result.sanitized;
      next();
    } catch (error) {
      console.error('Validation middleware error:', error);
      res.status(500).json({
        error: 'Validation error',
        message: '검증 중 오류가 발생했습니다'
      });
    }
  };
}

module.exports = {
  validateString,
  validateNumber,
  validatePaginationParams,
  validateComplexSearchParams,
  sanitizeForSQL,
  escapeHtml,
  createValidationMiddleware
};