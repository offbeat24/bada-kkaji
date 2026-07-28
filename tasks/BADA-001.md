---
id: BADA-001
title: Node 22 고정 및 BASS 하네스 커밋
status: DONE

type: maintenance
profile: nan2026

risk:
  level: low
  reasons: []

# models 는 생략하면 프로파일/프로젝트 설정을 따른다. 필요할 때만 override.
# models:
#   worker: auto

human:
  owner: user
  reviewer_required: true
---

## Problem

프로젝트가 Node.js 22.13 이상을 요구하지만 로컬에는 Node.js 20만 설치되어 있어
게임 빌드를 요구 버전에서 검증할 수 없다. 새로 적용한 BASS 하네스 파일도 아직
커밋되지 않았다.

## What we are shipping

Node.js 22 최신 패치 버전을 설치하고 프로젝트에 정확한 버전을 고정한다. 해당
버전에서 의존성, BASS 상태, 게임 테스트와 빌드를 검증하고 현재 BASS/NAN 설정을
하나의 커밋으로 기록한다.

## What we are not shipping

게임플레이, UI, 배포 설정 또는 의존성 취약점의 자동 수정은 변경하지 않는다.

## Facts

`package.json`은 Node.js `>=22.13.0`을 요구한다. 현재 설치된 nvm 버전은 최대
20.19.6이며 BASS 0.1.1 설정은 작업 트리에 초기화되어 있다.

## Decisions

시스템 전역 기본 버전은 바꾸지 않고 nvm에 Node.js 22를 설치한 뒤 `.nvmrc`로
프로젝트 범위 버전을 고정한다.

## Assumptions

없음

## Relevant context

`package.json`, `package-lock.json`, `bass.yaml`, `AGENTS.md`,
`nan/AGENT_WORKFLOW.md`, `.nvmrc`.

## Allowed scope

Node.js 프로젝트 버전 고정, 의존성 재설치, BASS 생성 파일과 검증 기록, Git 커밋.

## Forbidden scope

게임 소스 변경, 배포, 원격 push, `npm audit fix`, 시스템 기본 Node alias 변경.

## Acceptance criteria

Node.js 22가 설치되고 `.nvmrc`와 실제 검증 버전이 일치한다. `npm ci`, BASS
doctor, NAN trace/protection과 게임 빌드가 통과한다. 기존 테스트 파일 누락과 lint
오류는 제품 코드 수정 없이 알려진 제한으로 기록한다. 변경사항을 로컬 Git 커밋으로
기록한다.

## Human judgment

사용자가 Node 버전 변경과 `bada-kkaji` 게임 커밋을 명시적으로 요청했다. 기존
테스트·lint 문제는 이번 하네스 설정 커밋과 분리한다.

## Verification

Node.js 22.23.1과 npm 10.9.8을 사용했다. `npm ci`, `bass doctor`,
`bass nan trace validate`, `bass nan protect verify` 및 `npm run build`가
통과했다. `npm test`는 존재하지 않는 `tests/rendered-html.test.mjs` 때문에,
`npm run lint`는 `app/page.tsx:513`의 기존 `react-hooks/immutability` 오류
때문에 완료되지 않았다.

## Rollback

생성된 커밋을 revert하고 `.nvmrc`를 제거한다. 필요하면 기존 Node 20을 `nvm use`
명령으로 다시 선택한다.
