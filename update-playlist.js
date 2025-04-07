const axios = require("axios");
const { Octokit } = require("@octokit/rest");
require("dotenv").config();

const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_PLAYLIST_ID,
  GITHUB_TOKEN,
  GITHUB_REPO,
  GITHUB_FILE_PATH,
  GITHUB_BRANCH,
} = process.env;

const octokit = new Octokit({ auth: GITHUB_TOKEN });

async function getSpotifyAccessToken() {
  const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64");

  const res = await axios.post("https://accounts.spotify.com/api/token", "grant_type=client_credentials", {
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  return res.data.access_token;
}

async function fetchAllPlaylistTracks(accessToken) {
  let allItems = [];
  let nextUrl = `https://api.spotify.com/v1/playlists/${SPOTIFY_PLAYLIST_ID}/tracks?limit=100`;

  while (nextUrl) {
    const res = await axios.get(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const items = res.data.items.map((item) => ({
      title: item.track?.name || "Unknown Title",
      artist: item.track?.artists.map((a) => a.name).join(", ") || "Unknown Artist",
      album_art: item.track?.album?.images?.[0]?.url || "",
      spotify_url: item.track?.external_urls?.spotify || "",
      date_added: item.added_at,
    }));

    allItems.push(...items);
    nextUrl = res.data.next;
  }

  return allItems;
}

async function getCurrentFileSha(owner, repo, path, branch) {
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref: branch,
    });
    return data.sha;
  } catch (err) {
    if (err.status === 404) return null; // file doesn't exist yet
    throw err;
  }
}

async function updateGitHubFile(contentJson) {
  const [owner, repo] = GITHUB_REPO.split("/");

  const sha = await getCurrentFileSha(owner, repo, GITHUB_FILE_PATH, GITHUB_BRANCH);

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: GITHUB_FILE_PATH,
    message: `Update playlist.json - ${new Date().toISOString()}`,
    content: Buffer.from(JSON.stringify(contentJson, null, 2)).toString("base64"),
    sha: sha || undefined,
    branch: GITHUB_BRANCH,
  });
}

(async () => {
  try {
    const token = await getSpotifyAccessToken();
    const playlistData = await fetchAllPlaylistTracks(token);
    await updateGitHubFile(playlistData);
    console.log("✅ Playlist successfully updated.");
  } catch (error) {
    console.error("❌ Error updating playlist:", error.message);
    process.exit(1);
  }
})();
