; Daily uninstall: offer to delete the user's data (history, reports, downloaded models) — default No.
; Skipped when the uninstaller runs as part of an upgrade (${isUpdated}), so updating never touches data.
; Only folders holding Daily's database are deleted: another app may also be called "Daily". %APPDATA%\Daylens is
; only there if the first Daily launch had to copy (not move) the old Daylens data.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Also delete your Daily history, reports and downloaded AI models?$\r$\n$\r$\nChoose No to keep them for a future install." /SD IDNO IDNO daylens_keep
      ${If} ${FileExists} "$APPDATA\Daily\daylens.sqlite"
        RMDir /r "$APPDATA\Daily"
      ${EndIf}
      ${If} ${FileExists} "$APPDATA\Daylens\daylens.sqlite"
        RMDir /r "$APPDATA\Daylens"
      ${EndIf}
    daylens_keep:
  ${endIf}
!macroend
