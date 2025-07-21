// 카카오맵 유틸리티 함수들

// 카카오맵 API 로드 확인
export const isKakaoMapLoaded = () => {
  return typeof window !== 'undefined' && window.kakao && window.kakao.maps
}

// 카카오맵 API 대기
export const waitForKakaoMap = () => {
  return new Promise((resolve, reject) => {
    // 카카오 객체가 있는지 확인
    if (typeof window === 'undefined' || !window.kakao) {
      reject(new Error('카카오 SDK가 로드되지 않았습니다'))
      return
    }

    // 이미 로드된 경우
    if (window.kakao.maps) {
      resolve(window.kakao.maps)
      return
    }

    // 카카오맵 로드
    window.kakao.maps.load(() => {
      if (window.kakao.maps) {
        resolve(window.kakao.maps)
      } else {
        reject(new Error('카카오맵 로드에 실패했습니다'))
      }
    })
  })
}

// 주소를 좌표로 변환
export const addressToCoords = (address) => {
  return new Promise((resolve, reject) => {
    if (!isKakaoMapLoaded()) {
      reject(new Error('카카오맵 API가 로드되지 않았습니다'))
      return
    }

    const geocoder = new window.kakao.maps.services.Geocoder()
    
    geocoder.addressSearch(address, (result, status) => {
      if (status === window.kakao.maps.services.Status.OK) {
        const coords = {
          lat: parseFloat(result[0].y),
          lng: parseFloat(result[0].x)
        }
        resolve(coords)
      } else {
        reject(new Error(`주소 검색에 실패했습니다: ${address}`))
      }
    })
  })
}

// 좌표를 주소로 변환
export const coordsToAddress = (lat, lng) => {
  return new Promise((resolve, reject) => {
    if (!isKakaoMapLoaded()) {
      reject(new Error('카카오맵 API가 로드되지 않았습니다'))
      return
    }

    const geocoder = new window.kakao.maps.services.Geocoder()
    const coord = new window.kakao.maps.LatLng(lat, lng)
    
    geocoder.coord2Address(coord.getLng(), coord.getLat(), (result, status) => {
      if (status === window.kakao.maps.services.Status.OK) {
        resolve(result[0].address)
      } else {
        reject(new Error('좌표를 주소로 변환하는데 실패했습니다'))
      }
    })
  })
}

// 서울 주요 지역 좌표 데이터
export const seoulRegions = [
  { name: '강남구', lat: 37.5172, lng: 127.0473 },
  { name: '강동구', lat: 37.5301, lng: 127.1238 },
  { name: '강북구', lat: 37.6397, lng: 127.0256 },
  { name: '강서구', lat: 37.5509, lng: 126.8495 },
  { name: '관악구', lat: 37.4784, lng: 126.9516 },
  { name: '광진구', lat: 37.5384, lng: 127.0822 },
  { name: '구로구', lat: 37.4955, lng: 126.8871 },
  { name: '금천구', lat: 37.4569, lng: 126.8954 },
  { name: '노원구', lat: 37.6544, lng: 127.0561 },
  { name: '도봉구', lat: 37.6688, lng: 127.0469 },
  { name: '동대문구', lat: 37.5744, lng: 127.0394 },
  { name: '동작구', lat: 37.5124, lng: 126.9393 },
  { name: '마포구', lat: 37.5665, lng: 126.9015 },
  { name: '서대문구', lat: 37.5794, lng: 126.9368 },
  { name: '서초구', lat: 37.4837, lng: 127.0324 },
  { name: '성동구', lat: 37.5634, lng: 127.0369 },
  { name: '성북구', lat: 37.5894, lng: 127.0167 },
  { name: '송파구', lat: 37.5145, lng: 127.1059 },
  { name: '양천구', lat: 37.5170, lng: 126.8665 },
  { name: '영등포구', lat: 37.5264, lng: 126.8962 },
  { name: '용산구', lat: 37.5384, lng: 126.9650 },
  { name: '은평구', lat: 37.6027, lng: 126.9291 },
  { name: '종로구', lat: 37.5735, lng: 126.9788 },
  { name: '중구', lat: 37.5640, lng: 126.9970 },
  { name: '중랑구', lat: 37.6063, lng: 127.0925 }
]

// 지역명으로 좌표 찾기
export const getRegionCoords = (regionName) => {
  const region = seoulRegions.find(r => r.name.includes(regionName) || regionName.includes(r.name))
  return region ? { lat: region.lat, lng: region.lng } : null
}

// 랜덤 좌표 생성 (테스트용)
export const generateRandomCoords = (centerLat = 37.5665, centerLng = 126.9780, radius = 0.1) => {
  const randomLat = centerLat + (Math.random() - 0.5) * radius
  const randomLng = centerLng + (Math.random() - 0.5) * radius
  return { lat: randomLat, lng: randomLng }
}

export default {
  isKakaoMapLoaded,
  waitForKakaoMap,
  addressToCoords,
  coordsToAddress,
  seoulRegions,
  getRegionCoords,
  generateRandomCoords
}