import { collection, doc, getDoc, getDocs, query, where, updateDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Anime, LinkedSeason } from '../types';

/**
 * Synchronize linkedSeasons array across all anime belonging to a seasonGroupId.
 */
export async function syncSeasonGroup(groupId: string): Promise<LinkedSeason[]> {
  if (!groupId) return [];

  const q = query(collection(db, 'anime'), where('seasonGroupId', '==', groupId));
  const snap = await getDocs(q);
  
  if (snap.empty) return [];

  const memberAnime: Anime[] = snap.docs.map(d => ({ ...(d.data() as Anime), id: d.id }));

  // Sort by seasonNumber ascending
  memberAnime.sort((a, b) => (a.seasonNumber || 1) - (b.seasonNumber || 1));

  const linkedSeasons: LinkedSeason[] = memberAnime.map((a, idx) => {
    let name = `Season ${a.seasonNumber ?? (idx + 1)}`;
    if (a.season && typeof a.season === 'string' && a.season.toLowerCase().includes('season')) {
      name = a.season;
    } else if (a.season && typeof a.season === 'string') {
      name = a.season;
    }
    
    // Clean up duplicate "Season Season"
    name = name.replace(/Season Season/gi, 'Season');
    
    return {
      animeId: a.id,
      seasonNumber: a.seasonNumber ?? (idx + 1),
      seasonName: name,
      slug: a.slug,
      title: a.title
    };
  });

  // Update all anime documents in the group with the unified linkedSeasons
  const updates = memberAnime.map(a => 
    updateDoc(doc(db, 'anime', a.id), {
      seasonGroupId: groupId,
      seasonNumber: a.seasonNumber ?? (linkedSeasons.find(ls => ls.animeId === a.id)?.seasonNumber || 1),
      linkedSeasons: linkedSeasons,
      updatedAt: Date.now()
    })
  );

  await Promise.all(updates);
  return linkedSeasons;
}

/**
 * Link a target anime to a franchise / season group.
 */
export async function linkAnimeToGroup(
  animeId: string, 
  targetGroupId: string, 
  seasonNumber: number
): Promise<LinkedSeason[]> {
  const animeRef = doc(db, 'anime', animeId);
  await updateDoc(animeRef, {
    seasonGroupId: targetGroupId,
    seasonNumber: seasonNumber,
    updatedAt: Date.now()
  });

  return await syncSeasonGroup(targetGroupId);
}

/**
 * Remove an anime from its franchise / season group.
 */
export async function unlinkAnimeFromGroup(animeId: string): Promise<void> {
  const animeRef = doc(db, 'anime', animeId);
  const animeSnap = await getDoc(animeRef);
  if (!animeSnap.exists()) return;

  const data = animeSnap.data() as Anime;
  const oldGroupId = data.seasonGroupId;

  await updateDoc(animeRef, {
    seasonGroupId: null,
    seasonNumber: null,
    linkedSeasons: [],
    updatedAt: Date.now()
  });

  if (oldGroupId) {
    await syncSeasonGroup(oldGroupId);
  }
}
