# girr-website

기르 공식 홈페이지 (www.girr.co.kr).

- `static/` : 홈페이지, 채용, 개인정보처리방침 등 그대로 배포되는 파일
- `content/insights/` : 인사이트 글(마크다운). 파일 하나가 글 하나
- `build.js` : `node build.js` 로 `dist/` 생성 (외부 패키지 없음)
- `INSIGHTS_GUIDE.md` : 인사이트 작성 규칙

게시 흐름: 브랜치에서 글 작성 → Pull Request → Netlify 미리보기 확인 → 병합하면 게시.
