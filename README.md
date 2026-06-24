# spotify-dj-bot
The goal of this project is to create a bot that recommends the next song in a DJ mix.

## Features

### 1. User picks a song.
  - Bot analyzes the **key**, **BPM**, **genre**, and **energy** of the song
### 2. User specifies subset of songs for the bot to choose from, for example:
  - Liked songs
  - A set of the user's playlists
  - All Spotify songs (?)
### 3. User specifies similarities for the next song
  - Same/adjacent Camelot keys
  - BPM range
  - Same genre (y/n)
### 4. Bot chooses songs from the subset and returns a list to the user of similar songs
  - Give the user sorting options - set x number of priorities in order
      - ex. 1st priority = key, 2nd priority = BPM -> sort all songs by similar key first, then within each group, sort most similar BPM first
### 5. After user chooses a new song, assume steps 2 and 3 remain the same and repeat step 4
  - Keep a cache of a few songs - allow the user to move back in case they made a mistake etc
  - Allow user to reset - clear the current song and show all the songs in the set from step 2
      - Keep cache in case of mistakes
