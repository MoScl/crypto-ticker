; ---------------------------------------------------------------------------
; NSIS 自定义安装后处理（electron-builder: nsis.include）
;
; 背景 / 为什么要这个文件：
;   electron-builder 内置的 addDesktopLink / addStartMenuLink 生成快捷方式时，
;   图标一律写 app exe 本身：
;       CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 ...
;   也就是说「快捷方式图标 = CryptoTicker.exe 内嵌的图标」。
;   一旦打包时 rcedit 没跑（例如误设了 win.signAndEditExecutable=false），
;   exe 保留 Electron 默认图标，桌面 / 开始菜单快捷方式就会显示系统默认图标。
;
;   这里在内置的快捷方式创建完成之后（installSection.nsh 中 customInstall
;   位于 addStartMenuLink / addDesktopLink 之后，顺序有保证）用随包安装的
;   独立 ico 文件重建一次快捷方式，从根上断开对 exe 注入结果的依赖。
;
; 可用变量（由 electron-builder 模板定义）：
;   $appExe            安装目录下的 CryptoTicker.exe 全路径
;   $newDesktopLink    桌面快捷方式全路径
;   $newStartMenuLink  开始菜单快捷方式全路径
;   ${APP_ID}          electron-builder.yml 里的 appId
;   ${APP_DESCRIPTION} 应用描述
; ---------------------------------------------------------------------------

!macro customInstall
  ${If} ${FileExists} "$INSTDIR\resources\app.ico"
    ; ---- 桌面快捷方式：图标显式指向独立 ico（第 5 个参数为 IconFile，第 6 个为 IconIndex）----
    ${If} ${FileExists} "$newDesktopLink"
      CreateShortCut "$newDesktopLink" "$appExe" "" "$INSTDIR\resources\app.ico" 0 "" "" "${APP_DESCRIPTION}"
      ; 重新写回 AppUserModelID（CreateShortCut 会清掉之前设置的值），
      ; 保证与主进程 app.setAppUserModelId(APP_USER_MODEL_ID) 一致，任务栏固定可用。
      WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    ${EndIf}

    ; ---- 开始菜单快捷方式 ----
    ${If} ${FileExists} "$newStartMenuLink"
      CreateShortCut "$newStartMenuLink" "$appExe" "" "$INSTDIR\resources\app.ico" 0 "" "" "${APP_DESCRIPTION}"
      WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
    ${EndIf}
  ${EndIf}

  ; 通知 Shell 关联信息已变更，强制资源管理器/任务栏重建图标缓存。
  ; SHCNE_ASSOCCHANGED = 0x08000000，SHCNF_IDLIST = 0x0000
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
