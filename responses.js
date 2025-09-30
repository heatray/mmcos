const fs = require('fs');

// Generate realistic login response based on MITM dumps
function generateLoginResponse(platformId, displayName, userId) {
  const sessionToken = "AQAAAAIAAADKOgoAAAAAAOw1pngEt9tIATLqwyf7IzOwmSnBmY+d01mjfBYhXK522MAR9euYs4IIeCHpu4qjubwYGrHvAenTmsS5nGbzNN/EqeMjj4BExxBO8/2Gc+qXYqMeiIKhjd4/Sfc6Eh4QC5PWnPxyh7uDF/S7tOc8FKiY76QRDK9YowHPP35hrXOnAqLesExPLgyorLA/PoVQHVUDdsNaNMrd9/QGjAddvZjVH2XbR7mxwUFAeeVKByNriqqDbKBgA1X2EiRmSPUuHGR4OQhQFhRZgwa0IYgzHK+KzVU6UDxgRicfmWq1etOXCh0sgdujivHnBSkxBvmSacClH4/4iGhXIywUUgVlBY3j/byC3z6qETE=";
  const userFacingId = Math.random().toString(36).substring(2, 15).toUpperCase();
  
  // Read authentic login response from dump and modify it
  try {
    let template = fs.readFileSync(__dirname + '/dump/Login_response.xml', 'utf8');
    
    // Replace dynamic values
    template = template.replace(/76561198081105540/g, platformId);
    template = template.replace(/670410/g, userId);
    template = template.replace(/J7W76GCH8FJKA/g, userFacingId);
    // Use the new sessionToken
    template = template.replace(/<SessionToken>.*?<\/SessionToken>/g, `<SessionToken>${sessionToken}</SessionToken>`);
    
    // Update dates to current year
    template = template.replace(/2023-/g, '2025-');
    
    return template;
  } catch (error) {
    console.warn('Could not read login response template, using fallback');
    // Fallback to simplified response
    return generateFallbackLoginResponse(platformId, displayName, userId, sessionToken, userFacingId);
  }
}

function generateFallbackLoginResponse(platformId, displayName, userId, sessionToken, userFacingId) {
  return `<LoginDetails xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Error i:nil="true"/>
  <GameConfigurationData>
    <CurrentEvent>
      <CurrentEvent>
        <BackgroundImageURL i:nil="true"/>
        <ButtonImageURL i:nil="true"/>
        <DescriptionLocString i:nil="true"/>
        <DevName i:nil="true"/>
        <EventID>0</EventID>
        <PlaylistID>0</PlaylistID>
        <PrizeCode i:nil="true"/>
        <TitleLocString i:nil="true"/>
      </CurrentEvent>
      <Error i:nil="true"/>
      <NextEvent>2025-12-16T00:00:00Z</NextEvent>
    </CurrentEvent>
    <DivisionBands>
      <Entries>
        <DivisionBandEntry>
          <BonusPoints>0</BonusPoints>
          <DivisionID>0</DivisionID>
          <MinPoints>0</MinPoints>
          <PromotionPrizeCode>Boxes:1:</PromotionPrizeCode>
          <RelegationMinPoints>0</RelegationMinPoints>
        </DivisionBandEntry>
        <DivisionBandEntry>
          <BonusPoints>0</BonusPoints>
          <DivisionID>1</DivisionID>
          <MinPoints>500</MinPoints>
          <PromotionPrizeCode>Boxes:1:</PromotionPrizeCode>
          <RelegationMinPoints>0</RelegationMinPoints>
        </DivisionBandEntry>
        <DivisionBandEntry>
          <BonusPoints>100</BonusPoints>
          <DivisionID>2</DivisionID>
          <MinPoints>1000</MinPoints>
          <PromotionPrizeCode>Boxes:1:</PromotionPrizeCode>
          <RelegationMinPoints>750</RelegationMinPoints>
        </DivisionBandEntry>
        <DivisionBandEntry>
          <BonusPoints>250</BonusPoints>
          <DivisionID>3</DivisionID>
          <MinPoints>1500</MinPoints>
          <PromotionPrizeCode>Boxes:1:</PromotionPrizeCode>
          <RelegationMinPoints>1250</RelegationMinPoints>
        </DivisionBandEntry>
        <DivisionBandEntry>
          <BonusPoints>500</BonusPoints>
          <DivisionID>4</DivisionID>
          <MinPoints>2000</MinPoints>
          <PromotionPrizeCode>Boxes:1:</PromotionPrizeCode>
          <RelegationMinPoints>1750</RelegationMinPoints>
        </DivisionBandEntry>
        <DivisionBandEntry>
          <BonusPoints>750</BonusPoints>
          <DivisionID>5</DivisionID>
          <MinPoints>2500</MinPoints>
          <PromotionPrizeCode>Boxes:1:</PromotionPrizeCode>
          <RelegationMinPoints>2250</RelegationMinPoints>
        </DivisionBandEntry>
        <DivisionBandEntry>
          <BonusPoints>750</BonusPoints>
          <DivisionID>6</DivisionID>
          <MinPoints>3000</MinPoints>
          <PromotionPrizeCode>Unlock:0:player_title_elite</PromotionPrizeCode>
          <RelegationMinPoints>0</RelegationMinPoints>
        </DivisionBandEntry>
      </Entries>
    </DivisionBands>
    <Hash>-1647532852</Hash>
    <Playlists>
      <Error i:nil="true"/>
      <Playlists>
        <Playlist>
          <GameModes xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>elimination</a:string>
          </GameModes>
          <Levels xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>track_grdn_a</a:string>
            <a:string>track_grom_a</a:string>
            <a:string>track_grom_b</a:string>
            <a:string>track_kchn_a</a:string>
            <a:string>track_kchn_b</a:string>
            <a:string>track_kchn_c</a:string>
            <a:string>track_schl_a</a:string>
            <a:string>track_tyrm_a</a:string>
            <a:string>track_wksp_a</a:string>
          </Levels>
          <Name>Quick Play Elimination</Name>
          <PlaylistID>8</PlaylistID>
          <SubType>elimination</SubType>
          <Type>quick</Type>
        </Playlist>
        <Playlist>
          <GameModes xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>race</a:string>
          </GameModes>
          <Levels xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>track_grdn_a</a:string>
            <a:string>track_grom_a</a:string>
            <a:string>track_grom_b</a:string>
            <a:string>track_kchn_a</a:string>
            <a:string>track_kchn_b</a:string>
            <a:string>track_kchn_c</a:string>
            <a:string>track_schl_a</a:string>
            <a:string>track_tyrm_a</a:string>
            <a:string>track_wksp_a</a:string>
          </Levels>
          <Name>Quick Play Race</Name>
          <PlaylistID>7</PlaylistID>
          <SubType>race</SubType>
          <Type>quick</Type>
        </Playlist>
      </Playlists>
    </Playlists>
  </GameConfigurationData>
  <GameInfo>
    <ScoreInfo>
      <CurrentSeasonID>45</CurrentSeasonID>
      <Division>0</Division>
      <Error i:nil="true"/>
      <PlayerSeasonID>45</PlayerSeasonID>
      <Points>0</Points>
      <Rank>1000</Rank>
      <UntrustedLevel>1</UntrustedLevel>
      <UntrustedPrestige>0</UntrustedPrestige>
    </ScoreInfo>
    <SeasonInfo>
      <BonusPoints>0</BonusPoints>
      <DisplayOffset>0</DisplayOffset>
      <IsSeasonActive>true</IsSeasonActive>
      <NewSeasonID>45</NewSeasonID>
      <OldSeasonID>45</OldSeasonID>
    </SeasonInfo>
  </GameInfo>
  <PlatformID>${platformId}</PlatformID>
  <ServerTime i:nil="true"/>
  <SessionToken>${sessionToken}</SessionToken>
  <UserFacingID>${userFacingId}</UserFacingID>
  <UserID>${userId}</UserID>
</LoginDetails>`;
}

module.exports = { generateLoginResponse };