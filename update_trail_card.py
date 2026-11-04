with open("frontend/src/components/home/HomeTrailInfoCardN2.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. JSX 수정
target_jsx = """        <View style={styles.cardTextCol}>
          <Text style={[styles.trailTitle, { color: colors.textMain }]}>산책 정보</Text>
          <Text style={[styles.trailDescription, { color: colors.textMuted }]} numberOfLines={2}>
            {isLoadingWeather ? '산책 날씨를 확인하고 있어요...' : weatherNotice}
          </Text>"""

replacement_jsx = """        <View style={styles.cardTextCol}>
          <View style={styles.titleRow}>
            <Text style={[styles.trailTitle, { color: colors.textMain }]}>산책 정보</Text>
            <View style={styles.detailLinkWrap}>
              <Text style={[styles.detailLinkText, { color: colors.primaryDark }]}>상세보기</Text>
              <Text style={[styles.detailLinkArrow, { color: colors.primaryDark }]}>›</Text>
            </View>
          </View>
          <Text style={[styles.trailDescription, { color: colors.textMuted }]} numberOfLines={2}>
            {isLoadingWeather ? '산책 날씨를 확인하고 있어요...' : weatherNotice}
          </Text>"""

assert target_jsx in content, "target_jsx not found in HomeTrailInfoCardN2.tsx"
content = content.replace(target_jsx, replacement_jsx, 1)

# 2. 스타일 수정
target_styles = """  cardTextCol: { flex: 1, paddingRight: 6 },
  trailTitle: { fontSize: TYPOGRAPHY.cardTitle, fontWeight: '800', color: '#2D3A31', marginBottom: 3, letterSpacing: -0.2 },"""

replacement_styles = """  cardTextCol: { flex: 1, paddingRight: 6 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  trailTitle: { fontSize: TYPOGRAPHY.cardTitle, fontWeight: '800', color: '#2D3A31', letterSpacing: -0.2 },
  detailLinkWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  detailLinkText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  detailLinkArrow: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 13,
  },"""

assert target_styles in content, "target_styles not found in HomeTrailInfoCardN2.tsx"
content = content.replace(target_styles, replacement_styles, 1)

with open("frontend/src/components/home/HomeTrailInfoCardN2.tsx", "w", encoding="utf-8") as f:
    f.write(content)

print("HomeTrailInfoCardN2.tsx successfully updated!")

