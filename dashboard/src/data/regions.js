// 전국 지역 데이터 - 시/도 > 시/군/구 구조
export const regionsData = {
  "서울특별시": {
    name: "서울특별시",
    type: "metropolitan",
    children: {
      "강남구": { name: "강남구", type: "district", coords: { lat: 37.5172, lng: 127.0473 } },
      "강동구": { name: "강동구", type: "district", coords: { lat: 37.5301, lng: 127.1238 } },
      "강북구": { name: "강북구", type: "district", coords: { lat: 37.6398, lng: 127.0256 } },
      "강서구": { name: "강서구", type: "district", coords: { lat: 37.5509, lng: 126.8495 } },
      "관악구": { name: "관악구", type: "district", coords: { lat: 37.4784, lng: 126.9516 } },
      "광진구": { name: "광진구", type: "district", coords: { lat: 37.5385, lng: 127.0823 } },
      "구로구": { name: "구로구", type: "district", coords: { lat: 37.4954, lng: 126.8875 } },
      "금천구": { name: "금천구", type: "district", coords: { lat: 37.4570, lng: 126.8954 } },
      "노원구": { name: "노원구", type: "district", coords: { lat: 37.6542, lng: 127.0568 } },
      "도봉구": { name: "도봉구", type: "district", coords: { lat: 37.6688, lng: 127.0471 } },
      "동대문구": { name: "동대문구", type: "district", coords: { lat: 37.5838, lng: 127.0507 } },
      "동작구": { name: "동작구", type: "district", coords: { lat: 37.5124, lng: 126.9393 } },
      "마포구": { name: "마포구", type: "district", coords: { lat: 37.5637, lng: 126.9087 } },
      "서대문구": { name: "서대문구", type: "district", coords: { lat: 37.5791, lng: 126.9368 } },
      "서초구": { name: "서초구", type: "district", coords: { lat: 37.4837, lng: 127.0324 } },
      "성동구": { name: "성동구", type: "district", coords: { lat: 37.5635, lng: 127.0370 } },
      "성북구": { name: "성북구", type: "district", coords: { lat: 37.5894, lng: 127.0167 } },
      "송파구": { name: "송파구", type: "district", coords: { lat: 37.5145, lng: 127.1059 } },
      "양천구": { name: "양천구", type: "district", coords: { lat: 37.5168, lng: 126.8664 } },
      "영등포구": { name: "영등포구", type: "district", coords: { lat: 37.5264, lng: 126.8962 } },
      "용산구": { name: "용산구", type: "district", coords: { lat: 37.5384, lng: 126.9656 } },
      "은평구": { name: "은평구", type: "district", coords: { lat: 37.6176, lng: 126.9227 } },
      "종로구": { name: "종로구", type: "district", coords: { lat: 37.5735, lng: 126.9788 } },
      "중구": { name: "중구", type: "district", coords: { lat: 37.5641, lng: 126.9979 } },
      "중랑구": { name: "중랑구", type: "district", coords: { lat: 37.6063, lng: 127.0925 } }
    }
  },
  "부산광역시": {
    name: "부산광역시",
    type: "metropolitan",
    children: {
      "강서구": { name: "강서구", type: "district", coords: { lat: 35.2120, lng: 128.9800 } },
      "금정구": { name: "금정구", type: "district", coords: { lat: 35.2432, lng: 129.0918 } },
      "기장군": { name: "기장군", type: "district", coords: { lat: 35.2447, lng: 129.2226 } },
      "남구": { name: "남구", type: "district", coords: { lat: 35.1368, lng: 129.0840 } },
      "동구": { name: "동구", type: "district", coords: { lat: 35.1296, lng: 129.0454 } },
      "동래구": { name: "동래구", type: "district", coords: { lat: 35.2048, lng: 129.0837 } },
      "부산진구": { name: "부산진구", type: "district", coords: { lat: 35.1622, lng: 129.0532 } },
      "북구": { name: "북구", type: "district", coords: { lat: 35.1975, lng: 128.9907 } },
      "사상구": { name: "사상구", type: "district", coords: { lat: 35.1497, lng: 128.9910 } },
      "사하구": { name: "사하구", type: "district", coords: { lat: 35.1041, lng: 128.9743 } },
      "서구": { name: "서구", type: "district", coords: { lat: 35.0971, lng: 129.0243 } },
      "수영구": { name: "수영구", type: "district", coords: { lat: 35.1454, lng: 129.1134 } },
      "연제구": { name: "연제구", type: "district", coords: { lat: 35.1765, lng: 129.0788 } },
      "영도구": { name: "영도구", type: "district", coords: { lat: 35.0916, lng: 129.0678 } },
      "중구": { name: "중구", type: "district", coords: { lat: 35.1066, lng: 129.0322 } },
      "해운대구": { name: "해운대구", type: "district", coords: { lat: 35.1632, lng: 129.1644 } }
    }
  },
  "대구광역시": {
    name: "대구광역시",
    type: "metropolitan",
    children: {
      "남구": { name: "남구", type: "district", coords: { lat: 35.8464, lng: 128.5978 } },
      "달서구": { name: "달서구", type: "district", coords: { lat: 35.8330, lng: 128.5326 } },
      "달성군": { name: "달성군", type: "district", coords: { lat: 35.7749, lng: 128.4311 } },
      "동구": { name: "동구", type: "district", coords: { lat: 35.8869, lng: 128.6350 } },
      "북구": { name: "북구", type: "district", coords: { lat: 35.8858, lng: 128.5828 } },
      "서구": { name: "서구", type: "district", coords: { lat: 35.8718, lng: 128.5593 } },
      "수성구": { name: "수성구", type: "district", coords: { lat: 35.8582, lng: 128.6308 } },
      "중구": { name: "중구", type: "district", coords: { lat: 35.8691, lng: 128.6060 } }
    }
  },
  "인천광역시": {
    name: "인천광역시", 
    type: "metropolitan",
    children: {
      "계양구": { name: "계양구", type: "district", coords: { lat: 37.5373, lng: 126.7376 } },
      "남동구": { name: "남동구", type: "district", coords: { lat: 37.4468, lng: 126.7312 } },
      "동구": { name: "동구", type: "district", coords: { lat: 37.4739, lng: 126.6432 } },
      "미추홀구": { name: "미추홀구", type: "district", coords: { lat: 37.4638, lng: 126.6505 } },
      "부평구": { name: "부평구", type: "district", coords: { lat: 37.5070, lng: 126.7218 } },
      "서구": { name: "서구", type: "district", coords: { lat: 37.5456, lng: 126.6760 } },
      "연수구": { name: "연수구", type: "district", coords: { lat: 37.4106, lng: 126.6789 } },
      "중구": { name: "중구", type: "district", coords: { lat: 37.4738, lng: 126.6213 } },
      "강화군": { name: "강화군", type: "district", coords: { lat: 37.7473, lng: 126.4877 } },
      "옹진군": { name: "옹진군", type: "district", coords: { lat: 37.4464, lng: 126.6370 } }
    }
  },
  "광주광역시": {
    name: "광주광역시",
    type: "metropolitan", 
    children: {
      "광산구": { name: "광산구", type: "district", coords: { lat: 35.1396, lng: 126.7934 } },
      "남구": { name: "남구", type: "district", coords: { lat: 35.1332, lng: 126.9026 } },
      "동구": { name: "동구", type: "district", coords: { lat: 35.1463, lng: 126.9240 } },
      "북구": { name: "북구", type: "district", coords: { lat: 35.1739, lng: 126.9124 } },
      "서구": { name: "서구", type: "district", coords: { lat: 35.1520, lng: 126.8905 } }
    }
  },
  "대전광역시": {
    name: "대전광역시",
    type: "metropolitan",
    children: {
      "대덕구": { name: "대덕구", type: "district", coords: { lat: 36.3466, lng: 127.4148 } },
      "동구": { name: "동구", type: "district", coords: { lat: 36.3113, lng: 127.4545 } },
      "서구": { name: "서구", type: "district", coords: { lat: 36.3552, lng: 127.3838 } },
      "유성구": { name: "유성구", type: "district", coords: { lat: 36.3624, lng: 127.3565 } },
      "중구": { name: "중구", type: "district", coords: { lat: 36.3251, lng: 127.4212 } }
    }
  },
  "울산광역시": {
    name: "울산광역시",
    type: "metropolitan",
    children: {
      "남구": { name: "남구", type: "district", coords: { lat: 35.5461, lng: 129.3308 } },
      "동구": { name: "동구", type: "district", coords: { lat: 35.5049, lng: 129.4167 } },
      "북구": { name: "북구", type: "district", coords: { lat: 35.5826, lng: 129.3614 } },
      "중구": { name: "중구", type: "district", coords: { lat: 35.5693, lng: 129.3360 } },
      "울주군": { name: "울주군", type: "district", coords: { lat: 35.5225, lng: 129.2427 } }
    }
  },
  "세종특별자치시": {
    name: "세종특별자치시",
    type: "special",
    children: {
      "세종시": { name: "세종시", type: "city", coords: { lat: 36.4875, lng: 127.2819 } }
    }
  },
  "경기도": {
    name: "경기도", 
    type: "province",
    children: {
      "수원시": { name: "수원시", type: "city", coords: { lat: 37.2636, lng: 127.0286 } },
      "성남시": { name: "성남시", type: "city", coords: { lat: 37.4201, lng: 127.1262 } },
      "고양시": { name: "고양시", type: "city", coords: { lat: 37.6584, lng: 126.8320 } },
      "용인시": { name: "용인시", type: "city", coords: { lat: 37.2411, lng: 127.1776 } },
      "부천시": { name: "부천시", type: "city", coords: { lat: 37.5035, lng: 126.7660 } },
      "안산시": { name: "안산시", type: "city", coords: { lat: 37.3218, lng: 126.8309 } },
      "안양시": { name: "안양시", type: "city", coords: { lat: 37.3943, lng: 126.9568 } },
      "남양주시": { name: "남양주시", type: "city", coords: { lat: 37.6361, lng: 127.2168 } },
      "화성시": { name: "화성시", type: "city", coords: { lat: 37.1996, lng: 126.8311 } },
      "평택시": { name: "평택시", type: "city", coords: { lat: 36.9921, lng: 127.1129 } },
      "의정부시": { name: "의정부시", type: "city", coords: { lat: 37.7382, lng: 127.0339 } },
      "시흥시": { name: "시흥시", type: "city", coords: { lat: 37.3803, lng: 126.8029 } },
      "파주시": { name: "파주시", type: "city", coords: { lat: 37.7599, lng: 126.7800 } },
      "광명시": { name: "광명시", type: "city", coords: { lat: 37.4785, lng: 126.8647 } },
      "김포시": { name: "김포시", type: "city", coords: { lat: 37.6150, lng: 126.7158 } },
      "군포시": { name: "군포시", type: "city", coords: { lat: 37.3617, lng: 126.9352 } },
      "오산시": { name: "오산시", type: "city", coords: { lat: 37.1499, lng: 127.0774 } },
      "이천시": { name: "이천시", type: "city", coords: { lat: 37.2792, lng: 127.4346 } },
      "양주시": { name: "양주시", type: "city", coords: { lat: 37.7851, lng: 127.0456 } },
      "구리시": { name: "구리시", type: "city", coords: { lat: 37.5943, lng: 127.1295 } },
      "안성시": { name: "안성시", type: "city", coords: { lat: 37.0078, lng: 127.2695 } },
      "포천시": { name: "포천시", type: "city", coords: { lat: 37.8948, lng: 127.2004 } },
      "의왕시": { name: "의왕시", type: "city", coords: { lat: 37.3449, lng: 126.9683 } },
      "하남시": { name: "하남시", type: "city", coords: { lat: 37.5392, lng: 127.2147 } },
      "여주시": { name: "여주시", type: "city", coords: { lat: 37.2982, lng: 127.6378 } },
      "동두천시": { name: "동두천시", type: "city", coords: { lat: 37.9036, lng: 127.0606 } },
      "과천시": { name: "과천시", type: "city", coords: { lat: 37.4292, lng: 126.9876 } },
      "가평군": { name: "가평군", type: "county", coords: { lat: 37.8314, lng: 127.5109 } },
      "양평군": { name: "양평군", type: "county", coords: { lat: 37.4892, lng: 127.4878 } },
      "연천군": { name: "연천군", type: "county", coords: { lat: 38.0963, lng: 127.0752 } }
    }
  },
  "강원특별자치도": {
    name: "강원특별자치도",
    type: "province",
    children: {
      "춘천시": { name: "춘천시", type: "city", coords: { lat: 37.8813, lng: 127.7299 } },
      "원주시": { name: "원주시", type: "city", coords: { lat: 37.3422, lng: 127.9202 } },
      "강릉시": { name: "강릉시", type: "city", coords: { lat: 37.7519, lng: 128.8761 } },
      "동해시": { name: "동해시", type: "city", coords: { lat: 37.5247, lng: 129.1144 } },
      "태백시": { name: "태백시", type: "city", coords: { lat: 37.1640, lng: 128.9856 } },
      "속초시": { name: "속초시", type: "city", coords: { lat: 38.2070, lng: 128.5918 } },
      "삼척시": { name: "삼척시", type: "city", coords: { lat: 37.4497, lng: 129.1658 } },
      "홍천군": { name: "홍천군", type: "county", coords: { lat: 37.6971, lng: 127.8889 } },
      "횡성군": { name: "횡성군", type: "county", coords: { lat: 37.4916, lng: 127.9859 } },
      "영월군": { name: "영월군", type: "county", coords: { lat: 37.1836, lng: 128.4614 } },
      "평창군": { name: "평창군", type: "county", coords: { lat: 37.3706, lng: 128.3900 } },
      "정선군": { name: "정선군", type: "county", coords: { lat: 37.3806, lng: 128.6606 } },
      "철원군": { name: "철원군", type: "county", coords: { lat: 38.1469, lng: 127.3139 } },
      "화천군": { name: "화천군", type: "county", coords: { lat: 38.1063, lng: 127.7085 } },
      "양구군": { name: "양구군", type: "county", coords: { lat: 38.1098, lng: 127.9898 } },
      "인제군": { name: "인제군", type: "county", coords: { lat: 38.0695, lng: 128.1709 } },
      "고성군": { name: "고성군", type: "county", coords: { lat: 38.3800, lng: 128.4677 } }
    }
  },
  "충청북도": {
    name: "충청북도",
    type: "province", 
    children: {
      "청주시": { name: "청주시", type: "city", coords: { lat: 36.6424, lng: 127.4890 } },
      "충주시": { name: "충주시", type: "city", coords: { lat: 36.9911, lng: 127.9259 } },
      "제천시": { name: "제천시", type: "city", coords: { lat: 37.1326, lng: 128.1909 } },
      "보은군": { name: "보은군", type: "county", coords: { lat: 36.4895, lng: 127.7295 } },
      "옥천군": { name: "옥천군", type: "county", coords: { lat: 36.3063, lng: 127.5705 } },
      "영동군": { name: "영동군", type: "county", coords: { lat: 36.1751, lng: 127.7834 } },
      "증평군": { name: "증평군", type: "county", coords: { lat: 36.7849, lng: 127.5814 } },
      "진천군": { name: "진천군", type: "county", coords: { lat: 36.8556, lng: 127.4345 } },
      "괴산군": { name: "괴산군", type: "county", coords: { lat: 36.8157, lng: 127.7878 } },
      "음성군": { name: "음성군", type: "county", coords: { lat: 36.9432, lng: 127.6869 } },
      "단양군": { name: "단양군", type: "county", coords: { lat: 36.9845, lng: 128.3659 } }
    }
  },
  "충청남도": {
    name: "충청남도",
    type: "province",
    children: {
      "천안시": { name: "천안시", type: "city", coords: { lat: 36.8151, lng: 127.1139 } },
      "공주시": { name: "공주시", type: "city", coords: { lat: 36.4465, lng: 127.1189 } },
      "보령시": { name: "보령시", type: "city", coords: { lat: 36.3336, lng: 126.6129 } },
      "아산시": { name: "아산시", type: "city", coords: { lat: 36.7898, lng: 127.0017 } },
      "서산시": { name: "서산시", type: "city", coords: { lat: 36.7849, lng: 126.4505 } },
      "논산시": { name: "논산시", type: "city", coords: { lat: 36.1873, lng: 127.0986 } },
      "계룡시": { name: "계룡시", type: "city", coords: { lat: 36.2743, lng: 127.2489 } },
      "당진시": { name: "당진시", type: "city", coords: { lat: 36.8934, lng: 126.6279 } },
      "금산군": { name: "금산군", type: "county", coords: { lat: 36.1088, lng: 127.4881 } },
      "부여군": { name: "부여군", type: "county", coords: { lat: 36.2758, lng: 126.9100 } },
      "서천군": { name: "서천군", type: "county", coords: { lat: 36.0796, lng: 126.6916 } },
      "청양군": { name: "청양군", type: "county", coords: { lat: 36.4593, lng: 126.8024 } },
      "홍성군": { name: "홍성군", type: "county", coords: { lat: 36.6013, lng: 126.6608 } },
      "예산군": { name: "예산군", type: "county", coords: { lat: 36.6819, lng: 126.8508 } },
      "태안군": { name: "태안군", type: "county", coords: { lat: 36.7456, lng: 126.2979 } }
    }
  }
};

// 지역 검색을 위한 유틸리티 함수들
export const getAllRegions = () => {
  const regions = [];
  
  Object.values(regionsData).forEach(province => {
    regions.push({
      id: province.name,
      name: province.name,
      type: province.type,
      level: 'province'
    });
    
    Object.values(province.children).forEach(city => {
      regions.push({
        id: `${province.name}_${city.name}`,
        name: city.name,
        type: city.type,
        level: 'city',
        parentId: province.name,
        coords: city.coords
      });
    });
  });
  
  return regions;
};

export const getRegionCoords = (regionName) => {
  // 시/도 레벨에서 찾기
  for (const province of Object.values(regionsData)) {
    if (province.name === regionName) {
      // 시/도의 경우 첫 번째 하위 지역의 좌표 반환
      const firstChild = Object.values(province.children)[0];
      return firstChild?.coords;
    }
    
    // 시/군/구 레벨에서 찾기
    for (const city of Object.values(province.children)) {
      if (city.name === regionName) {
        return city.coords;
      }
    }
  }
  
  return null;
};

export const getRegionsByProvince = (provinceName) => {
  const province = regionsData[provinceName];
  if (!province) return [];
  
  return Object.values(province.children);
};

export const searchRegions = (searchTerm) => {
  if (!searchTerm) return [];
  
  const results = [];
  const lowerSearchTerm = searchTerm.toLowerCase();
  
  Object.values(regionsData).forEach(province => {
    // 시/도명 검색
    if (province.name.toLowerCase().includes(lowerSearchTerm)) {
      results.push({
        id: province.name,
        name: province.name,
        type: province.type,
        level: 'province'
      });
    }
    
    // 시/군/구명 검색
    Object.values(province.children).forEach(city => {
      if (city.name.toLowerCase().includes(lowerSearchTerm)) {
        results.push({
          id: `${province.name}_${city.name}`,
          name: `${city.name} (${province.name})`,
          type: city.type,
          level: 'city',
          parentName: province.name,
          coords: city.coords
        });
      }
    });
  });
  
  return results;
};