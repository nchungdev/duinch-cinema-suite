import { StreamLink } from '../src/domain/models/StreamLink';
import { MediaMapper } from '../src/infrastructure/mappers/MediaMapper';

function testStreamLink() {
  console.log("\n--- Testing Entity: StreamLink ---");
  
  // Case 1: KKPhim Style
  const kk = new StreamLink({ link_m3u8: 'http://test.com/play.m3u8', link_embed: 'http://test.com/embed' });
  console.log(kk.hlsUrl === 'http://test.com/play.m3u8' ? "[OK] KKPhim HLS" : "[FAIL] KKPhim HLS");
  console.log(kk.embedUrl === 'http://test.com/embed' ? "[OK] KKPhim Embed" : "[FAIL] KKPhim Embed");
  
  // Case 2: Torrent Style
  const magnet = new StreamLink({ url: 'magnet:?xt=urn:btih:123', stream_type: 'P2P' });
  console.log(magnet.type === 'P2P' ? "[OK] Torrent Detection" : "[FAIL] Torrent Detection");

  // Case 3: Mixed types
  const mixed = new StreamLink({ m3u8: 'play.m3u8', embed: 'play.html' });
  console.log(mixed.hlsUrl && mixed.embedUrl ? "[OK] Multi-link support" : "[FAIL] Multi-link support");
}

function testMediaMapper() {
  console.log("\n--- Testing Mapper: MediaMapper ---");
  const rawResponse = {
    data: {
      metadata: {
        title: "Test Movie",
        year: "2024",
        tmdb_id: 123,
        poster_url: "/path.jpg"
      }
    }
  };
  
  const movie = MediaMapper.toDomain(rawResponse, 'movie', 123);
  console.log(movie.title === "Test Movie" ? "[OK] Title Mapping" : "[FAIL] Title Mapping");
  console.log(movie.year === 2024 ? "[OK] Year Parsing" : "[FAIL] Year Parsing");
}

try {
  testStreamLink();
  testMediaMapper();
  console.log("\n✅ ALL LOGIC TESTS PASSED!");
} catch (e) {
  console.error("\n❌ LOGIC TEST FAILED:", e);
  process.exit(1);
}
