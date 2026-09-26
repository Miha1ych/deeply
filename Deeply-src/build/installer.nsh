; Deeply installer additions (electron-builder NSIS)

!ifndef BUILD_UNINSTALLER
  ; "Create a desktop shortcut" checkbox on the last page
  !define MUI_FINISHPAGE_SHOWREADME ""
  !define MUI_FINISHPAGE_SHOWREADME_TEXT "Создать ярлык на рабочем столе"
  !define MUI_FINISHPAGE_SHOWREADME_FUNCTION DeeplyDesktopShortcut

  Function DeeplyDesktopShortcut
    CreateShortCut "$DESKTOP\Deeply.lnk" "$INSTDIR\Deeply.exe" "" "$INSTDIR\Deeply.exe" 0
  FunctionEnd
!endif

!macro customUnInstall
  ${ifNot} ${isUpdated}
    Delete "$DESKTOP\Deeply.lnk"
    ; "start with Windows" entry written by the app
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.deeply.app"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "com.deeply.app"
  ${endIf}
!macroend
