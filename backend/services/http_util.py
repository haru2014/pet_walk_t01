"""외부 서비스 호출에 공통으로 쓰는 HTTPS 설정."""

import ssl


def ssl_context() -> ssl.SSLContext:
    """인증서 검증을 유지한 채 certifi 인증서를 쓴다.

    macOS 의 python.org 파이썬은 기본 인증서 목록이 없어 HTTPS 호출이
    CERTIFICATE_VERIFY_FAILED 로 실패한다. certifi 는 requests 의 의존 패키지다.
    """
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()
