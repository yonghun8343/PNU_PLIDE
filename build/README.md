# `build/` — electron-builder 빌드 자원

이 디렉토리는 `electron-builder` 가 번들링 과정에서 참조하는 정적 리소스를 둔다.
`electron-builder.yml` 의 `directories.buildResources: build` 로 바인딩되어 있다.

## 아이콘 규칙

electron-builder 는 파일명 기반으로 플랫폼별 아이콘을 자동 선택한다. 누락되면 기본 아이콘(Electron 심볼)이 그대로 배포된다.

| 파일 | 플랫폼 | 최소 해상도 | 비고 |
|---|---|---|---|
| `icon.icns` | macOS | 1024×1024 (다중 해상도 포함) | `iconutil` 또는 `makeicns` 로 생성 |
| `icon.ico` | Windows | 256×256 (다중 해상도 포함) | `png2ico` / ImageMagick 으로 생성 |
| `icon.png` | Linux | 512×512 이상 (정사각) | tar.gz 번들에 embed |
| `background.png` | macOS DMG | 540×380 | 생략 시 기본 DMG 레이아웃 |

## 추가 파일

- **`entitlements.mac.plist`** — macOS 코드서명 도입 시 적용될 권한 목록. 현재 무서명 빌드에서는 참조만 되고 실제 효과 없음.

## 체크리스트

```sh
# 현재 build/ 디렉토리 확인
ls -la build/

# 아이콘 누락 여부 확인
for f in icon.icns icon.ico icon.png entitlements.mac.plist; do
  [ -f "build/$f" ] && echo "OK  $f" || echo "MISSING  $f"
done
```
