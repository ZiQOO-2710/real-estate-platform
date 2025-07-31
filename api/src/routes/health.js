const express = require('express');
const router = express.Router();
const db = require('../config/database');

// 시스템 상태 체크
router.get('/', async (req, res) => {
  try {
    const startTime = Date.now();
    
    // 데이터베이스 연결 테스트
    const naverTest = await db.queryNaver('SELECT COUNT(*) as count FROM apartment_complexes LIMIT 1');
    const molitTest = await db.queryMolit('SELECT COUNT(*) as count FROM apartment_transactions LIMIT 1');
    
    const responseTime = Date.now() - startTime;
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      databases: {
        naver: {
          connected: true,
          complexes: naverTest[0].count
        },
        molit: {
          connected: true,
          transactions: molitTest[0].count
        }
      },
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        responseTime: `${responseTime}ms`
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 데이터베이스 상세 정보
router.get('/database', async (req, res) => {
  try {
    const [
      naverComplexes,
      naverListings,
      molitTransactions,
      molitRegions
    ] = await Promise.all([
      db.queryNaver('SELECT COUNT(DISTINCT complex_id) as count FROM apartment_complexes'),
      db.queryNaver('SELECT COUNT(*) as count FROM current_listings'),
      db.queryMolit('SELECT COUNT(*) as count FROM apartment_transactions'),
      db.queryMolit('SELECT COUNT(DISTINCT region_name) as count FROM apartment_transactions')
    ]);

    res.json({
      naver: {
        complexes: naverComplexes[0].count,
        listings: naverListings[0].count,
        database: 'naver_real_estate.db'
      },
      molit: {
        transactions: molitTransactions[0].count,
        regions: molitRegions[0].count,
        database: 'molit_complete_data.db'
      },
      combined: {
        total_data_points: naverComplexes[0].count + naverListings[0].count + molitTransactions[0].count
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Database health check failed',
      message: error.message
    });
  }
});

module.exports = router;