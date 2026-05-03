import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, FlatList, Image, SafeAreaView, StatusBar } from 'react-native';
import { api, getProxiedImageUrl } from '@shared/api/config';
import { MediaRepository } from '@shared/infrastructure/repositories/MediaRepository';

export default function App() {
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Note: You need to set API_URL in your env to point to your backend IP
    // e.g., http://192.168.1.100:8086
    const fetchTrending = async () => {
      try {
        const results = await MediaRepository.getTrending('movie');
        setTrending(results);
      } catch (error) {
        console.error('Failed to fetch trending:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchTrending();
  }, []);

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <Image 
        source={{ uri: getProxiedImageUrl(item.poster) }} 
        style={styles.poster} 
      />
      <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>DUINCH CINEMA</Text>
      </View>
      {loading ? (
        <View style={styles.center}>
          <Text style={styles.text}>Loading Discovery Stream...</Text>
        </View>
      ) : (
        <FlatList
          data={trending}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          numColumns={2}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0c',
  },
  header: {
    padding: 20,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 4,
  },
  list: {
    padding: 10,
  },
  card: {
    flex: 1,
    margin: 10,
    backgroundColor: '#16161a',
    borderRadius: 15,
    overflow: 'hidden',
  },
  poster: {
    width: '100%',
    height: 250,
    resizeMode: 'cover',
  },
  title: {
    color: '#fff',
    padding: 10,
    fontSize: 12,
    fontWeight: 'bold',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: '#666',
  }
});
