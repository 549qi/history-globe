; 《我，地图和小女仆》安装向导模板 —— 由 make_iss.py 生成三个变体脚本
#define WorkDir "D:\OneDrive\文档\kimi\tasks\2026-10-10\23-26-24-ec69875a\work"
#define OutDir  WorkDir + "\pack\installer"

[Setup]
AppId={#AppGuid}
AppName=我，地图和小女仆（{#VariantCN}）
AppVerName=我，地图和小女仆 {#VariantCN} v1.0
AppVersion=1.0
AppPublisher=柯星
AppComments=愿你在这里遇见喜欢的历史
DefaultDirName={autopf}\我，地图和小女仆-{#VariantCN}
DefaultGroupName=我，地图和小女仆
PrivilegesRequired=lowest
OutputDir={#OutDir}
OutputBaseFilename=我，地图和小女仆-安装程序-{#VariantCN}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
WizardSizePercent=110
DisableProgramGroupPage=yes
UninstallDisplayName=我，地图和小女仆（{#VariantCN}）
VersionInfoVersion=1.0.0.0
VersionInfoCompany=柯星
VersionInfoDescription=我，地图和小女仆（{#VariantCN}）安装程序
VersionInfoProductName=我，地图和小女仆

[Languages]
Name: "chs"; MessagesFile: "{#WorkDir}\pack\ChineseSimplified.isl"

[Files]
Source: "{#WorkDir}\pack\app\我，地图和小女仆.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#WorkDir}\out\{#Variant}\program.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#WorkDir}\out\{#Variant}\data\*"; DestDir: "{app}\data"; Flags: ignoreversion

[Icons]
Name: "{autodesktop}\我，地图和小女仆（{#VariantCN}）"; Filename: "{app}\我，地图和小女仆.exe"; WorkingDir: "{app}"
Name: "{group}\我，地图和小女仆（{#VariantCN}）"; Filename: "{app}\我，地图和小女仆.exe"; WorkingDir: "{app}"
Name: "{group}\卸载"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\我，地图和小女仆.exe"; Description: "现在就翻开这册地图"; Flags: postinstall nowait skipifsilent unchecked
