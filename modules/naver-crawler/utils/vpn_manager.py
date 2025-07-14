#!/usr/bin/env python3
"""
VPN 관리자 - WARP + NordVPN 백업 시스템
"""

import asyncio
import subprocess
import requests
import time
import logging
from typing import Optional, Tuple, Dict, Any
from pathlib import Path
import json

logger = logging.getLogger(__name__)

class VPNManager:
    """VPN 관리 클래스 - WARP 우선, NordVPN 백업"""
    
    def __init__(self):
        self.current_vpn = None
        self.warp_failures = 0
        self.nordvpn_failures = 0
        self.max_failures = 3
        self.test_url = "https://httpbin.org/ip"
        self.blocked_indicators = [
            "차단되었습니다",
            "blocked",
            "rate limit",
            "too many requests",
            "captcha",
            "접근이 제한"
        ]
        
    async def check_ip_status(self) -> Tuple[bool, str, str]:
        """
        현재 IP 상태 확인
        Returns: (연결성공여부, IP주소, VPN타입)
        """
        try:
            response = requests.get(self.test_url, timeout=10)
            if response.status_code == 200:
                data = response.json()
                ip = data.get('origin', 'Unknown')
                
                # VPN 타입 판별
                vpn_type = self.detect_vpn_type(ip)
                return True, ip, vpn_type
            else:
                return False, "No Connection", "None"
                
        except Exception as e:
            logger.error(f"IP 상태 확인 실패: {e}")
            return False, "Error", "None"
    
    def detect_vpn_type(self, ip: str) -> str:
        """IP 주소로 VPN 타입 감지"""
        try:
            # Cloudflare WARP IP 범위 (예시)
            cloudflare_ranges = [
                "104.28", "104.29", "104.30", "104.31",
                "172.64", "172.65", "172.66", "172.67"
            ]
            
            for cf_range in cloudflare_ranges:
                if ip.startswith(cf_range):
                    return "WARP"
            
            # NordVPN인지 확인 (일반적으로 알려진 범위들)
            # 실제로는 더 정확한 방법이 필요할 수 있음
            return "NordVPN"
            
        except Exception:
            return "Unknown"
    
    async def check_warp_status(self) -> Tuple[bool, str]:
        """WARP 상태 확인"""
        try:
            result = subprocess.run(
                ['warp-cli', 'status'], 
                capture_output=True, 
                text=True, 
                timeout=10
            )
            
            if result.returncode == 0:
                status_output = result.stdout.lower()
                if 'connected' in status_output:
                    # IP 확인
                    connected, ip, vpn_type = await self.check_ip_status()
                    if connected and vpn_type == "WARP":
                        return True, ip
                    else:
                        return False, ip
                else:
                    return False, "Disconnected"
            else:
                return False, "WARP CLI Error"
                
        except subprocess.TimeoutExpired:
            logger.error("WARP 상태 확인 타임아웃")
            return False, "Timeout"
        except FileNotFoundError:
            logger.error("WARP CLI가 설치되어 있지 않습니다")
            return False, "Not Installed"
        except Exception as e:
            logger.error(f"WARP 상태 확인 실패: {e}")
            return False, str(e)
    
    async def connect_warp(self) -> bool:
        """WARP 연결"""
        try:
            logger.info("🔄 WARP 연결 시도 중...")
            
            # WARP 연결
            result = subprocess.run(
                ['warp-cli', 'connect'],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0:
                # 연결 확인
                await asyncio.sleep(3)  # 연결 안정화 대기
                connected, ip = await self.check_warp_status()
                
                if connected:
                    logger.info(f"✅ WARP 연결 성공 - IP: {ip}")
                    self.current_vpn = "WARP"
                    self.warp_failures = 0
                    return True
                else:
                    logger.warning("⚠️ WARP 연결 명령 성공했지만 IP 확인 실패")
                    return False
            else:
                logger.error(f"❌ WARP 연결 실패: {result.stderr}")
                return False
                
        except Exception as e:
            logger.error(f"❌ WARP 연결 오류: {e}")
            return False
    
    async def disconnect_warp(self) -> bool:
        """WARP 연결 해제"""
        try:
            result = subprocess.run(
                ['warp-cli', 'disconnect'],
                capture_output=True,
                text=True,
                timeout=15
            )
            
            if result.returncode == 0:
                logger.info("🔌 WARP 연결 해제")
                return True
            else:
                logger.warning(f"⚠️ WARP 연결 해제 실패: {result.stderr}")
                return False
                
        except Exception as e:
            logger.error(f"❌ WARP 연결 해제 오류: {e}")
            return False
    
    def check_nordvpn_installed(self) -> bool:
        """NordVPN CLI 설치 확인"""
        try:
            result = subprocess.run(
                ['nordvpn', '--version'],
                capture_output=True,
                text=True,
                timeout=5
            )
            return result.returncode == 0
        except:
            return False
    
    async def get_nordvpn_status(self) -> Tuple[bool, str]:
        """NordVPN 상태 확인"""
        try:
            result = subprocess.run(
                ['nordvpn', 'status'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                status_output = result.stdout.lower()
                if 'connected' in status_output:
                    # IP 확인
                    connected, ip, vpn_type = await self.check_ip_status()
                    return connected, ip
                else:
                    return False, "Disconnected"
            else:
                return False, "NordVPN CLI Error"
                
        except Exception as e:
            logger.error(f"NordVPN 상태 확인 실패: {e}")
            return False, str(e)
    
    async def connect_nordvpn(self, country: str = "South_Korea") -> bool:
        """NordVPN 연결"""
        try:
            if not self.check_nordvpn_installed():
                logger.error("❌ NordVPN CLI가 설치되어 있지 않습니다")
                logger.info("💡 설치 방법: https://nordvpn.com/download/linux/")
                return False
            
            logger.info(f"🔄 NordVPN 연결 시도 중... (국가: {country})")
            
            # NordVPN 연결
            result = subprocess.run(
                ['nordvpn', 'connect', country],
                capture_output=True,
                text=True,
                timeout=60
            )
            
            if result.returncode == 0:
                # 연결 확인
                await asyncio.sleep(5)  # 연결 안정화 대기
                connected, ip = await self.get_nordvpn_status()
                
                if connected:
                    logger.info(f"✅ NordVPN 연결 성공 - IP: {ip}")
                    self.current_vpn = "NordVPN"
                    self.nordvpn_failures = 0
                    return True
                else:
                    logger.warning("⚠️ NordVPN 연결 명령 성공했지만 IP 확인 실패")
                    return False
            else:
                logger.error(f"❌ NordVPN 연결 실패: {result.stderr}")
                
                # 로그인이 필요한 경우
                if "please log in" in result.stderr.lower():
                    logger.error("🔑 NordVPN 로그인이 필요합니다")
                    logger.info("💡 로그인: nordvpn login")
                
                return False
                
        except Exception as e:
            logger.error(f"❌ NordVPN 연결 오류: {e}")
            return False
    
    async def disconnect_nordvpn(self) -> bool:
        """NordVPN 연결 해제"""
        try:
            result = subprocess.run(
                ['nordvpn', 'disconnect'],
                capture_output=True,
                text=True,
                timeout=15
            )
            
            if result.returncode == 0:
                logger.info("🔌 NordVPN 연결 해제")
                return True
            else:
                logger.warning(f"⚠️ NordVPN 연결 해제 실패: {result.stderr}")
                return False
                
        except Exception as e:
            logger.error(f"❌ NordVPN 연결 해제 오류: {e}")
            return False
    
    async def ensure_vpn_connection(self) -> Tuple[bool, str, str]:
        """
        VPN 연결 보장 (WARP 우선, NordVPN 백업)
        Returns: (성공여부, IP주소, VPN타입)
        """
        logger.info("🔍 VPN 연결 상태 확인 중...")
        
        # 현재 연결 상태 확인
        connected, ip, vpn_type = await self.check_ip_status()
        
        if connected:
            logger.info(f"✅ 현재 연결 상태: {vpn_type} - IP: {ip}")
            self.current_vpn = vpn_type
            return True, ip, vpn_type
        
        # 1단계: WARP 연결 시도
        logger.info("🚀 1단계: WARP 연결 시도")
        warp_success = await self.connect_warp()
        
        if warp_success:
            connected, ip, vpn_type = await self.check_ip_status()
            return True, ip, "WARP"
        else:
            self.warp_failures += 1
            logger.warning(f"⚠️ WARP 연결 실패 ({self.warp_failures}/{self.max_failures})")
        
        # 2단계: NordVPN 백업 연결
        if self.warp_failures >= self.max_failures:
            logger.info("🚀 2단계: NordVPN 백업 연결 시도")
            
            # WARP 연결 해제
            await self.disconnect_warp()
            
            # NordVPN 연결
            nordvpn_success = await self.connect_nordvpn()
            
            if nordvpn_success:
                connected, ip, vpn_type = await self.check_ip_status()
                return True, ip, "NordVPN"
            else:
                self.nordvpn_failures += 1
                logger.error(f"❌ NordVPN 연결도 실패 ({self.nordvpn_failures}/{self.max_failures})")
        
        # 모든 VPN 연결 실패
        logger.error("❌ 모든 VPN 연결 실패")
        return False, "No VPN", "None"
    
    async def handle_blocking_detected(self, content: str = "") -> Tuple[bool, str, str]:
        """
        차단 감지시 VPN 전환 처리
        Returns: (복구성공여부, 새IP주소, VPN타입)
        """
        logger.warning("🚨 IP 차단 감지!")
        
        # 차단 원인 분석
        blocked_reason = "Unknown"
        for indicator in self.blocked_indicators:
            if indicator in content.lower():
                blocked_reason = indicator
                break
        
        logger.info(f"차단 원인: {blocked_reason}")
        
        # 현재 VPN에 따른 전환 전략
        if self.current_vpn == "WARP":
            logger.info("🔄 WARP에서 NordVPN으로 전환 시도")
            
            # WARP 연결 해제
            await self.disconnect_warp()
            await asyncio.sleep(2)
            
            # NordVPN 연결
            success = await self.connect_nordvpn()
            if success:
                connected, ip, vpn_type = await self.check_ip_status()
                return True, ip, "NordVPN"
            
        elif self.current_vpn == "NordVPN":
            logger.info("🔄 NordVPN 서버 변경 시도")
            
            # 다른 국가로 변경 시도
            countries = ["Japan", "United_States", "Germany", "South_Korea"]
            for country in countries:
                await self.disconnect_nordvpn()
                await asyncio.sleep(2)
                
                success = await self.connect_nordvpn(country)
                if success:
                    connected, ip, vpn_type = await self.check_ip_status()
                    return True, ip, "NordVPN"
        
        # 전환 실패시 WARP 복구 시도
        logger.info("🔄 WARP 복구 시도")
        success = await self.connect_warp()
        if success:
            connected, ip, vpn_type = await self.check_ip_status()
            return True, ip, "WARP"
        
        return False, "Failed", "None"
    
    def get_vpn_stats(self) -> Dict[str, Any]:
        """VPN 통계 정보"""
        return {
            "current_vpn": self.current_vpn,
            "warp_failures": self.warp_failures,
            "nordvpn_failures": self.nordvpn_failures,
            "max_failures": self.max_failures
        }

# 글로벌 VPN 매니저 인스턴스
vpn_manager = VPNManager()

async def ensure_safe_connection() -> Tuple[bool, str, str]:
    """안전한 연결 보장"""
    return await vpn_manager.ensure_vpn_connection()

async def handle_ip_blocked(content: str = "") -> Tuple[bool, str, str]:
    """IP 차단시 처리"""
    return await vpn_manager.handle_blocking_detected(content)