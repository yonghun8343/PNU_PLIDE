; ============================================================================
; PLIDE — NSIS Installer Custom Hooks
; ----------------------------------------------------------------------------
; electron-builder 의 NSIS 템플릿이 노출하는 매크로 hook 들을 사용해
; "executableName: pnu-pl-ide → PLIDE" 마이그레이션 잔재를 자동 정리한다.
;
;   호출 시점:
;     - customInstall   : 설치 시 모든 파일 복사 + 바로가기 생성 직후
;     - customUnInstall : 제거 시 파일 삭제 직전
;
;   참고: appId(`edu.pusan.pl.ide`) 는 변하지 않았으므로 레지스트리 uninstall
;   엔트리는 자동으로 재사용된다. 문제는 INSTDIR 안에 남는 구 실행파일과
;   바로가기 링크뿐이다.
; ============================================================================

!macro customInstall
  ; ------------------------------------------------------------------------
  ; (1) 구 실행파일 정리.
  ;   이전 빌드는 `executableName: pnu-pl-ide` 이었으므로 INSTDIR 에
  ;   `pnu-pl-ide.exe` 와 그 보조 파일들이 남아 있을 수 있다.
  ; ------------------------------------------------------------------------
  Delete "$INSTDIR\pnu-pl-ide.exe"

  ; ------------------------------------------------------------------------
  ; (2) 구 바로가기 정리.
  ;   shortcutName 은 productName 을 따르므로 "PLIDE" 로 통일됐지만,
  ;   과거 productName 이 "PL IDE"(공백 포함) 였던 적이 있어 잔재 가능.
  ; ------------------------------------------------------------------------
  Delete "$DESKTOP\PL IDE.lnk"
  Delete "$SMPROGRAMS\PL IDE.lnk"
  Delete "$SMPROGRAMS\PL IDE\PL IDE.lnk"
  RMDir  "$SMPROGRAMS\PL IDE"

  Delete "$DESKTOP\pnu-pl-ide.lnk"
  Delete "$SMPROGRAMS\pnu-pl-ide.lnk"
  Delete "$SMPROGRAMS\pnu-pl-ide\pnu-pl-ide.lnk"
  RMDir  "$SMPROGRAMS\pnu-pl-ide"

  ; ------------------------------------------------------------------------
  ; (3) electron-builder 가 만드는 새 바로가기는 "PLIDE.lnk" 이므로
  ;     명시적 처리 불필요.
  ; ------------------------------------------------------------------------
!macroend

!macro customUnInstall
  ; uninstall 시에도 위 잔재가 보일 수 있으므로 동일하게 청소.
  Delete "$INSTDIR\pnu-pl-ide.exe"
  Delete "$DESKTOP\PL IDE.lnk"
  Delete "$SMPROGRAMS\PL IDE.lnk"
  RMDir  "$SMPROGRAMS\PL IDE"
  Delete "$DESKTOP\pnu-pl-ide.lnk"
  Delete "$SMPROGRAMS\pnu-pl-ide.lnk"
  RMDir  "$SMPROGRAMS\pnu-pl-ide"
!macroend
